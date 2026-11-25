import { NextResponse } from "next/server";
import { adminFirestore, adminDb } from "@/lib/firebaseAdmin";

function pointsForRank(rank, withHint = false) {
  const base = Math.max(10, 110 - rank * 10);
  return withHint ? Math.round(base * 0.75) : base;
}

function applyPowerup(basePoints, powerup) {
  if (!powerup) return basePoints;
  if (powerup === "2X") return basePoints * 2;
  if (powerup === "SUPERSONIC") return Math.round(basePoints * 1.5);
  return basePoints;
}

// POST /api/games/[id]/action
export async function POST(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const { action } = body;

  const liveRef = adminDb.ref(`liveGames/${id}`);
  const gameDoc = await adminFirestore.collection("games").doc(id).get();
  if (!gameDoc.exists) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const game = gameDoc.data();

  // ── JOIN ──────────────────────────────────────────────────────────────────
  if (action === "JOIN") {
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    if (body.code !== game.code) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

    const playerRef = liveRef.child(`players/${name}`);
    const existing = await playerRef.get();
    if (existing.exists()) return NextResponse.json({ error: "Name taken" }, { status: 400 });

    await playerRef.set({ name, score: 0, streak: 0, powerups: ["2X", "SUPERSONIC", "STREAK_BOOSTER", "DOUBLE_JEOPARDY"], joinedAt: Date.now() });
    await adminFirestore.collection("games").doc(id).update({ [`players.${name}`]: true });
    return NextResponse.json({ ok: true });
  }

  // ── START_GAME ────────────────────────────────────────────────────────────
  if (action === "START_GAME") {
    const firstQ = game.questions[0];
    const liveState = {
      status: "ACTIVE",
      currentQuestion: 0,
      question: { ...firstQ, hintRevealed: false, revealedAnswer: "" },
      submissions: {},
      firstCorrectWinner: null,
      resultRevealed: false,
      startedAt: Date.now(),
      timerEndsAt: Date.now() + (firstQ.timeLimit || game.timePerQuestion || 30) * 1000,
    };
    await liveRef.update(liveState);
    await adminFirestore.collection("games").doc(id).update({ status: "ACTIVE", currentQuestion: 0 });
    return NextResponse.json({ ok: true });
  }

  // ── NEXT_QUESTION ─────────────────────────────────────────────────────────
  if (action === "NEXT_QUESTION") {
    const nextIdx = (game.currentQuestion ?? 0) + 1;
    if (nextIdx >= game.questions.length) {
      await liveRef.update({ status: "ENDED" });
      await adminFirestore.collection("games").doc(id).update({ status: "ENDED", currentQuestion: nextIdx });
      return NextResponse.json({ ok: true, ended: true });
    }
    const nextQ = game.questions[nextIdx];
    await liveRef.update({
      currentQuestion: nextIdx,
      question: { ...nextQ, hintRevealed: false, revealedAnswer: "" },
      submissions: {},
      firstCorrectWinner: null,
      resultRevealed: false,
      startedAt: Date.now(),
      timerEndsAt: Date.now() + (nextQ.timeLimit || game.timePerQuestion || 30) * 1000,
    });
    await adminFirestore.collection("games").doc(id).update({ currentQuestion: nextIdx });
    return NextResponse.json({ ok: true });
  }

  // ── SUBMIT_GUESS ──────────────────────────────────────────────────────────
  if (action === "SUBMIT_GUESS") {
    const liveSnap = await liveRef.get();
    const live = liveSnap.val();
    if (!live || live.status !== "ACTIVE") return NextResponse.json({ error: "Round not active" }, { status: 400 });

    const { playerName, guess, activePowerup } = body;
    const playerRef = liveRef.child(`players/${playerName}`);
    const playerSnap = await playerRef.get();
    if (!playerSnap.exists()) return NextResponse.json({ error: "Player not found" }, { status: 404 });
    const player = playerSnap.val();

    const normalise = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
    const isCorrect = Boolean(live.question?.answer) && normalise(guess) === normalise(live.question.answer);

    const submissions = live.submissions || {};
    const alreadySolved = Object.values(submissions).some((s) => s.playerName === playerName && s.isCorrect);
    if (alreadySolved) return NextResponse.json({ locked: true });

    const priorCorrect = Object.values(submissions).filter((s) => s.isCorrect).length;
    const rank = isCorrect ? priorCorrect + 1 : null;
    let pts = isCorrect ? pointsForRank(rank, live.question?.hintRevealed) : 0;
    pts = applyPowerup(pts, activePowerup);

    if (activePowerup === "DOUBLE_JEOPARDY" && !isCorrect) {
      await playerRef.update({ score: Math.max(0, (player.score || 0) - pts) });
    } else if (isCorrect) {
      const newStreak = (player.streak || 0) + 1;
      const streakBonus = activePowerup === "STREAK_BOOSTER" ? newStreak * 5 : 0;
      await playerRef.update({ score: (player.score || 0) + pts + streakBonus, streak: newStreak });
    } else {
      await playerRef.update({ streak: 0 });
    }

    const subId = `${playerName}_${Date.now()}`;
    await liveRef.child(`submissions/${subId}`).set({ playerName, guess, isCorrect, pointsAwarded: pts, rank, time: Date.now() });

    if (isCorrect && !live.firstCorrectWinner) {
      await liveRef.update({ firstCorrectWinner: { playerName, points: pts, time: Date.now() } });
    }

    return NextResponse.json({ isCorrect, points: pts });
  }

  // ── REVEAL_HINT ───────────────────────────────────────────────────────────
  if (action === "REVEAL_HINT") {
    await liveRef.child("question/hintRevealed").set(true);
    return NextResponse.json({ ok: true });
  }

  // ── REVEAL_RESULT ─────────────────────────────────────────────────────────
  if (action === "REVEAL_RESULT") {
    const liveSnap = await liveRef.get();
    const live = liveSnap.val();
    const answer = (body.correctAnswer || live?.question?.answer || "").trim();
    await liveRef.update({
      "question/revealedAnswer": answer,
      resultRevealed: true,
      status: "LEADERBOARD",
    });
    return NextResponse.json({ ok: true });
  }

  // ── CLOSE_QUESTION ────────────────────────────────────────────────────────
  if (action === "CLOSE_QUESTION") {
    await liveRef.update({ status: "LEADERBOARD", timerEndsAt: Date.now() });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
