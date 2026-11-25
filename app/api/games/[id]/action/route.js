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
    const displayName = body.name?.trim();
    if (!displayName) return NextResponse.json({ error: "Name required" }, { status: 400 });
    if (body.code !== game.code) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

    // Case-insensitive: use lowercase as the Firebase key
    const playerKey = displayName.toLowerCase();
    const playerRef = liveRef.child(`players/${playerKey}`);
    const existing = await playerRef.get();

    if (existing.exists()) {
      const storedKey = existing.val()?.sessionKey;
      if (body.sessionKey && storedKey && body.sessionKey === storedKey) {
        return NextResponse.json({ ok: true, rejoined: true });
      }
      return NextResponse.json({ error: "Name already taken" }, { status: 400 });
    }

    const sessionKey = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await playerRef.set({ name: playerKey, displayName, score: 0, streak: 0, powerups: ["2X", "SUPERSONIC", "STREAK_BOOSTER", "DOUBLE_JEOPARDY"], joinedAt: Date.now(), sessionKey });
    await adminFirestore.collection("games").doc(id).update({ [`players.${playerKey}`]: true });
    return NextResponse.json({ ok: true, sessionKey });
  }

  // ── START_GAME ────────────────────────────────────────────────────────────
  if (action === "START_GAME") {
    const firstQ = game.questions[0];
    const timeLimit = firstQ.timeLimit || game.timePerQuestion || 30;
    const liveState = {
      status: "ACTIVE",
      currentQuestion: 0,
      question: { ...firstQ, hintRevealed: false, revealedAnswer: "" },
      submissions: {},
      firstCorrectWinner: null,
      resultRevealed: false,
      startedAt: Date.now(),
      timerEndsAt: timeLimit > 0 ? Date.now() + timeLimit * 1000 : 0,
    };
    await liveRef.update(liveState);
    await adminFirestore.collection("games").doc(id).update({ status: "ACTIVE", currentQuestion: 0 });
    return NextResponse.json({ ok: true });
  }

  // ── NEXT_QUESTION ─────────────────────────────────────────────────────────
  if (action === "NEXT_QUESTION") {
    // Read live state for accurate currentQuestion (not stale Firestore)
    const liveSnap = await liveRef.get();
    const live = liveSnap.val();
    const nextIdx = (live?.currentQuestion ?? 0) + 1;

    if (nextIdx >= game.questions.length) {
      await liveRef.update({ status: "ENDED" });
      await adminFirestore.collection("games").doc(id).update({ status: "ENDED", currentQuestion: nextIdx });
      return NextResponse.json({ ok: true, ended: true });
    }

    const nextQ = game.questions[nextIdx];
    const timeLimit = nextQ.timeLimit || game.timePerQuestion || 30;
    await liveRef.update({
      status: "ACTIVE",   // ← fix: reset to ACTIVE for next question
      currentQuestion: nextIdx,
      question: { ...nextQ, hintRevealed: false, revealedAnswer: "" },
      submissions: {},
      firstCorrectWinner: null,
      resultRevealed: false,
      startedAt: Date.now(),
      timerEndsAt: timeLimit > 0 ? Date.now() + timeLimit * 1000 : 0,
    });
    await adminFirestore.collection("games").doc(id).update({ currentQuestion: nextIdx, status: "ACTIVE" });
    return NextResponse.json({ ok: true });
  }

  // ── SUBMIT_GUESS ──────────────────────────────────────────────────────────
  if (action === "SUBMIT_GUESS") {
    const liveSnap = await liveRef.get();
    const live = liveSnap.val();
    if (!live || live.status !== "ACTIVE") return NextResponse.json({ error: "Round not active" }, { status: 400 });

    const { playerName, guess, activePowerup } = body;
    const playerKey = (playerName || "").toLowerCase();
    const playerRef = liveRef.child(`players/${playerKey}`);
    const playerSnap = await playerRef.get();
    if (!playerSnap.exists()) return NextResponse.json({ error: "Player not found" }, { status: 404 });
    const player = playerSnap.val();

    const normalise = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
    const isCorrect = Boolean(live.question?.answer) && normalise(guess) === normalise(live.question.answer);

    const submissions = live.submissions || {};
    const alreadySolved = Object.values(submissions).some((s) => s.playerName === playerKey && s.isCorrect);
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

    const subId = `${playerKey}_${Date.now()}`;
    await liveRef.child(`submissions/${subId}`).set({ playerName: playerKey, guess, isCorrect, pointsAwarded: pts, rank, time: Date.now() });

    if (isCorrect && !live.firstCorrectWinner) {
      await liveRef.update({ firstCorrectWinner: { playerName: playerKey, points: pts, time: Date.now() } });
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
    const liveSnap = await liveRef.get();
    const live = liveSnap.val();
    const answer = live?.question?.answer || "";
    await liveRef.update({
      status: "LEADERBOARD",
      timerEndsAt: Date.now(),
      "question/revealedAnswer": answer,
      resultRevealed: true,
    });
    return NextResponse.json({ ok: true });
  }

  // ── RESTART_GAME ──────────────────────────────────────────────────────────
  if (action === "RESTART_GAME") {
    const newCode = String(Math.floor(1000 + Math.random() * 9000));
    await liveRef.set({
      status: "LOBBY",
      currentQuestion: -1,
      players: {},
      submissions: {},
      question: null,
      firstCorrectWinner: null,
      resultRevealed: false,
    });
    await adminFirestore.collection("games").doc(id).update({
      status: "LOBBY",
      currentQuestion: -1,
      players: {},
      code: newCode,
    });
    return NextResponse.json({ ok: true, code: newCode });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
