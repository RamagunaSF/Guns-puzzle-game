import { NextResponse } from "next/server";
import { gameState } from "@/lib/store";

function normalizeText(str) {
  return (str || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function pointsForRank(rank) {
  if (rank < 1) return 0;
  return Math.max(10, 110 - rank * 10);
}

export async function GET() {
  return NextResponse.json(gameState);
}

export async function POST(req) {
  const body = await req.json();
  const { action } = body;

  if (action === "JOIN") {
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    if (body.code !== gameState.code) {
      return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
    }
    const exists = gameState.players.some(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      return NextResponse.json({ error: "Name already taken" }, { status: 400 });
    }
    gameState.players.push({
      name,
      score: 0,
      roundPoints: 0,
      roundRank: null,
      solvedCurrent: false,
    });
  }

  if (action === "START_QUESTION") {
    if (gameState.questionNumber >= gameState.maxQuestions) {
      gameState.status = "ENDED";
      return NextResponse.json(gameState);
    }

    const cleanAnswer = (body.answer || "").trim();
    gameState.questionNumber += 1;
    gameState.question = {
      image: body.image,
      answer: cleanAnswer,
      hintText: (body.hintText || "").trim(),
      hintRevealed: false,
      revealedAnswer: "",
    };
    gameState.submissions = [];
    gameState.firstCorrectWinner = null;
    gameState.resultRevealed = false;
    gameState.lastWinner = null;
    gameState.players.forEach((p) => {
      p.roundPoints = 0;
      p.roundRank = null;
      p.solvedCurrent = false;
    });
    gameState.status = "ACTIVE";
  }

  if (action === "REVEAL_HINT") {
    if (gameState.question) {
      gameState.question.hintRevealed = true;
    }
  }

  if (action === "SUBMIT_GUESS") {
    if (gameState.status !== "ACTIVE" || !gameState.question) {
      return NextResponse.json({ error: "Round is not active" }, { status: 400 });
    }

    const player = gameState.players.find((p) => p.name === body.playerName);
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Lock player once they have already answered correctly this round
    if (player.solvedCurrent) {
      return NextResponse.json({
        ...gameState,
        locked: true,
        message: "Already answered correctly for this question.",
      });
    }

    const cleanGuess = (body.guess || "").trim();
    const isCorrect =
      Boolean(gameState.question.answer) &&
      normalizeText(cleanGuess) === normalizeText(gameState.question.answer);

    let rank = null;
    let pointsAwarded = 0;

    if (isCorrect) {
      const priorCorrectCount = gameState.submissions.filter(
        (s) => s.isCorrect
      ).length;
      rank = priorCorrectCount + 1;
      pointsAwarded = pointsForRank(rank);

      player.solvedCurrent = true;
      player.roundPoints = pointsAwarded;
      player.roundRank = rank;

      if (!gameState.firstCorrectWinner) {
        gameState.firstCorrectWinner = {
          playerName: player.name,
          guess: cleanGuess,
          points: pointsAwarded,
          time: new Date().toLocaleTimeString(),
        };
      }
    }

    gameState.submissions.push({
      id: Date.now() + Math.random(),
      playerName: player.name,
      guess: cleanGuess,
      isCorrect,
      pointsAwarded,
      rank,
      time: new Date().toLocaleTimeString(),
    });
  }

  if (action === "REVEAL_RESULT") {
    if (gameState.question) {
      gameState.question.revealedAnswer =
        (body.correctAnswer || "").trim() || gameState.question.answer || "";
    }

    if (!gameState.resultRevealed) {
      gameState.players.forEach((p) => {
        if (p.roundPoints > 0) {
          p.score += p.roundPoints;
        }
      });
      gameState.resultRevealed = true;
    }

    const hasAnyCorrect = gameState.submissions.some((s) => s.isCorrect);
    if (hasAnyCorrect) {
      gameState.lastWinner = gameState.firstCorrectWinner?.playerName || null;
      gameState.status = "LEADERBOARD";
    } else {
      gameState.lastWinner = null;
      gameState.status = "NO_WINNERS";
    }
  }

  if (action === "MARK_WINNER") {
    const player = gameState.players.find((p) => p.name === body.playerName);
    if (player && !player.solvedCurrent) {
      const priorCorrectCount = gameState.submissions.filter(
        (s) => s.isCorrect
      ).length;
      const rank = priorCorrectCount + 1;
      const pts = pointsForRank(rank);
      player.solvedCurrent = true;
      player.roundPoints = pts;
      player.roundRank = rank;
    }

    if (!gameState.resultRevealed) {
      gameState.players.forEach((p) => {
        if (p.roundPoints > 0) {
          p.score += p.roundPoints;
        }
      });
      gameState.resultRevealed = true;
    }

    if (gameState.question) {
      gameState.question.revealedAnswer =
        (body.correctAnswer || "").trim() || gameState.question.answer || "";
    }
    gameState.lastWinner = body.playerName;
    gameState.status = "LEADERBOARD";
  }

  if (action === "END_GAME") {
    gameState.status = "ENDED";
  }

  if (action === "RESET_GAME") {
    gameState.code = String(Math.floor(1000 + Math.random() * 9000));
    gameState.status = "LOBBY";
    gameState.questionNumber = 0;
    gameState.players = [];
    gameState.question = null;
    gameState.submissions = [];
    gameState.firstCorrectWinner = null;
    gameState.resultRevealed = false;
    gameState.lastWinner = null;
  }

  return NextResponse.json(gameState);
}