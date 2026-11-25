"use client";

import { useEffect, useState } from "react";

function getHintDisplay(question) {
  if (!question) return "";
  if (question.hintText) return question.hintText;

  const words = (question.answer || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "No hint available.";

  const clues = words.map((word, idx) => {
    const firstChar = word[0]?.toUpperCase() || "";
    const ordinal =
      idx === 0
        ? "1st"
        : idx === 1
        ? "2nd"
        : idx === 2
        ? "3rd"
        : `${idx + 1}th`;
    return `${ordinal} word starts with "${firstChar}" (${word.length} letters)`;
  });

  return clues.join(" • ");
}

export default function PlayerPage() {
  const [game, setGame] = useState(null);
  const [code, setCode] = useState("1234");
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState(null); // { type: "wrong" | "correct", text: string }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("code")) setCode(params.get("code"));

    const fetchGame = async () => {
      const res = await fetch("/api/game");
      const data = await res.json();
      setGame(data);
    };

    fetchGame();
    const interval = setInterval(fetchGame, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (game?.status === "ACTIVE" && game.submissions.length === 0) {
      setFeedback(null);
      setGuess("");
    }
  }, [game?.status, game?.submissions?.length]);

  const handleJoin = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "JOIN", code, name }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setJoined(true);
  };

  const handleRevealHint = async () => {
    await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "REVEAL_HINT" }),
    });
    const res = await fetch("/api/game");
    setGame(await res.json());
  };

  const handleSubmitGuess = async (e) => {
    e.preventDefault();
    if (!guess.trim()) return;
    const res = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "SUBMIT_GUESS", playerName: name, guess }),
    });
    const data = await res.json();
    setGame(data);

    const me = data.players?.find((p) => p.name === name);
    if (me?.solvedCurrent) {
      setFeedback({
        type: "correct",
        text: `Congratulations, ${name}! Your answer is correct (#${me.roundRank} • +${me.roundPoints} pts pending until result reveal).`,
      });
    } else {
      setFeedback({
        type: "wrong",
        text: "Not quite — keep trying!",
      });
      setGuess("");
    }
  };

  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-50 p-4 text-slate-900">
        <form
          onSubmit={handleJoin}
          className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-lg"
        >
          <h1 className="text-center text-2xl font-bold text-indigo-700">
            Join Puzzle Game
          </h1>
          {error && (
            <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>
          )}
          <input
            type="text"
            placeholder="Room Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-lg border p-3 text-center font-mono text-lg"
            required
          />
          <input
            type="text"
            placeholder="Your Unique Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border p-3"
            required
          />
          <button className="w-full rounded-lg bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700">
            Join Game
          </button>
        </form>
      </div>
    );
  }

  const currentPlayer = game?.players?.find((p) => p.name === name);
  const isLocked = Boolean(currentPlayer?.solvedCurrent);
  const sortedPlayers = [...(game?.players || [])].sort((a, b) => b.score - a.score);
  const answerWords = (game?.question?.answer || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const hintRevealed = Boolean(game?.question?.hintRevealed);
  const maxQuestions = game?.maxQuestions || 20;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-indigo-100 p-4 text-slate-900">
      {game?.status === "LOBBY" && (
        <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
          <h2 className="text-2xl font-bold text-indigo-700">Welcome, {name}!</h2>
          <p className="mt-2 text-slate-500">
            Waiting for the host to show Question 1 of {maxQuestions}...
          </p>
        </div>
      )}

      {game?.status === "ACTIVE" && game.question && (
        <div className="w-full max-w-xl space-y-6">
          <div className="text-center text-xs font-bold uppercase tracking-wider text-indigo-700">
            Question {game.questionNumber} of {maxQuestions}
          </div>

          {/* Puzzle Image Card */}
          <div className="flex min-h-[260px] items-center justify-center rounded-3xl border-4 border-indigo-400 bg-white p-6 shadow-xl">
            <img
              src={game.question.image}
              alt="Puzzle"
              className="max-h-64 object-contain"
            />
          </div>

          {/* Word-Grouped Boxes */}
          <div className="flex flex-wrap items-center justify-center gap-6">
            {answerWords.map((word, wIdx) => (
              <div key={wIdx} className="flex gap-2">
                {word.split("").map((char, cIdx) => {
                  const showFirstLetter =
                    hintRevealed && !game.question.hintText && cIdx === 0;
                  return (
                    <div
                      key={cIdx}
                      className="flex h-12 w-10 items-center justify-center rounded-xl bg-white text-lg font-bold text-indigo-700 shadow"
                    >
                      {showFirstLetter ? (
                        char.toUpperCase()
                      ) : (
                        <span className="mt-5 block h-1 w-6 rounded bg-slate-500" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Hint Button & Revealed Clue */}
          <div className="flex flex-col items-center gap-2">
            {!hintRevealed ? (
              <button
                type="button"
                onClick={handleRevealHint}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow hover:bg-amber-600"
              >
                Show Hint
              </button>
            ) : (
              <div className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-900">
                <b>Hint:</b> {getHintDisplay(game.question)}
              </div>
            )}
          </div>

          {/* Celebration Lock Card when Correct, or Input Form when Still Trying */}
          {isLocked ? (
            <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-5 text-center shadow-md space-y-1">
              <p className="text-xl font-extrabold text-emerald-700">
                Congratulations! You got it right!
              </p>
              <p className="text-sm font-semibold text-emerald-900">
                Status: Correct (#{currentPlayer?.roundRank} • +
                {currentPlayer?.roundPoints} pts)
              </p>
              <p className="text-xs text-emerald-800">
                Your answer is locked for this round. Leaderboard updates once the host
                reveals results.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitGuess} className="flex gap-2">
              <input
                type="text"
                placeholder="Type your answer..."
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                className="flex-1 rounded-xl border-2 border-indigo-300 bg-white px-4 py-3 text-lg focus:border-indigo-600 focus:outline-none"
              />
              <button className="rounded-xl bg-indigo-600 px-6 py-3 font-bold text-white hover:bg-indigo-700">
                Send
              </button>
            </form>
          )}

          {!isLocked && feedback?.type === "wrong" && (
            <p className="text-center text-sm font-semibold text-rose-600">
              {feedback.text}
            </p>
          )}
        </div>
      )}

      {game?.status === "NO_WINNERS" && (
        <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 text-center shadow-xl">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-600">
            Question {game.questionNumber} of {maxQuestions}
          </p>
          <h2 className="text-2xl font-bold text-slate-800">
            Nobody got it right this round!
          </h2>
          {game.question?.revealedAnswer && (
            <p className="rounded-lg bg-indigo-50 py-2 text-lg font-mono font-bold text-indigo-800">
              Answer: {game.question.revealedAnswer}
            </p>
          )}
          <p className="text-sm text-slate-500">
            Skipping to the next question — wait for the host...
          </p>
        </div>
      )}

      {game?.status === "LEADERBOARD" && (
        <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 text-center shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Results After Question {game.questionNumber} of {maxQuestions}
          </p>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
            1st Correct: {game.lastWinner}
          </p>
          {game.question?.revealedAnswer && (
            <p className="rounded-lg bg-indigo-50 py-2 text-lg font-mono font-bold text-indigo-800">
              Answer: {game.question.revealedAnswer}
            </p>
          )}
          <div className="pt-4 text-left">
            <h3 className="mb-2 font-bold text-slate-600">Leaderboard</h3>
            {sortedPlayers.map((p, i) => (
              <div
                key={p.name}
                className="flex justify-between border-b py-2 last:border-0"
              >
                <span>
                  <b>#{i + 1}</b> {p.name}
                </span>
                <span className="font-bold text-indigo-600">{p.score} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {game?.status === "ENDED" && (
        <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 text-center shadow-xl">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
            Game Over ({game.questionNumber} Questions)
          </p>
          <h2 className="text-3xl font-bold text-emerald-700">
            {sortedPlayers[0]?.name || "No Winner"}
          </h2>
          <p className="text-sm text-slate-500">Final Standings</p>
          <div className="pt-2 text-left">
            {sortedPlayers.map((p, i) => (
              <div
                key={p.name}
                className="flex justify-between border-b py-2 last:border-0"
              >
                <span>
                  <b>#{i + 1}</b> {p.name}
                </span>
                <span className="font-bold text-indigo-600">{p.score} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}