"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

export default function HostGamePage() {
  const { id } = useParams();
  const router = useRouter();
  const [game, setGame] = useState(null);
  const [live, setLive] = useState(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchGame = useCallback(async () => {
    const [gRes, lRes] = await Promise.all([
      fetch(`/api/games/${id}`),
      fetch(`/api/games/${id}/live`),
    ]);
    setGame(await gRes.json());
    setLive(await lRes.json());
  }, [id]);

  useEffect(() => {
    fetchGame();
    setJoinUrl(`${window.location.origin}/play/${id}`);
    const interval = setInterval(fetchGame, 2000);
    return () => clearInterval(interval);
  }, [fetchGame]);

  const action = async (payload) => {
    setLoading(true);
    await fetch(`/api/games/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await fetchGame();
    setLoading(false);
  };

  if (!game || !live) return <div className="p-8 text-slate-500">Loading...</div>;

  const players = Object.values(live.players || {}).sort((a, b) => b.score - a.score);
  const currentQ = game.questions?.[live.currentQuestion ?? 0];
  const submissions = Object.values(live.submissions || {});
  const qIdx = live.currentQuestion ?? -1;
  const totalQ = game.questions?.length || 0;
  const isLobby = !live.status || live.status === "LOBBY" || live.status === "DRAFT";
  const isActive = live.status === "ACTIVE";
  const isLeaderboard = live.status === "LEADERBOARD";
  const isEnded = live.status === "ENDED";

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-white">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-800 p-5">
          <div>
            <h1 className="text-2xl font-bold">{game.title}</h1>
            <p className="text-slate-400 text-sm mt-1">
              Room Code:{" "}
              <span className="font-mono text-xl font-bold text-indigo-400">{game.code}</span>
              {" · "}Status: <span className="font-semibold text-white">{live.status || "LOBBY"}</span>
              {qIdx >= 0 && ` · Q${qIdx + 1}/${totalQ}`}
            </p>
          </div>
          <div className="flex gap-3">
            {isActive && (
              <button
                onClick={() => action({ action: "CLOSE_QUESTION" })}
                disabled={loading}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
              >
                Close Question
              </button>
            )}
            {isLeaderboard && !isEnded && (
              <button
                onClick={() => action({ action: "NEXT_QUESTION" })}
                disabled={loading}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50"
              >
                {qIdx + 1 >= totalQ - 1 ? "End Game" : `Next Question →`}
              </button>
            )}
            {isActive && (
              <button
                onClick={() => action({ action: "REVEAL_HINT" })}
                disabled={loading || live.question?.hintRevealed}
                className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-yellow-400 disabled:opacity-40"
              >
                {live.question?.hintRevealed ? "Hint Shown" : "Reveal Hint (-25% pts)"}
              </button>
            )}
            {isActive && (
              <button
                onClick={() => action({ action: "REVEAL_RESULT", correctAnswer: currentQ?.answer })}
                disabled={loading}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50"
              >
                Reveal Answer
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">

          {/* Left: QR + Players */}
          <div className="space-y-6">
            <div className="rounded-2xl bg-slate-800 p-5 space-y-4">
              <div className="flex justify-center">
                {joinUrl && (
                  <div className="rounded-xl bg-white p-3">
                    <QRCodeSVG value={joinUrl} size={150} />
                  </div>
                )}
              </div>
              <p className="text-center text-xs text-slate-400 break-all">{joinUrl}</p>
              <div className="text-center">
                <span className="text-sm text-slate-400">Players joined: </span>
                <span className="font-bold text-indigo-400">{players.length}</span>
              </div>

              {isLobby && (
                <button
                  onClick={() => action({ action: "START_GAME" })}
                  disabled={loading || players.length === 0}
                  className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  {players.length === 0 ? "Waiting for players..." : "Start Game"}
                </button>
              )}
            </div>

            {/* Leaderboard */}
            <div className="rounded-2xl bg-slate-800 p-5">
              <h2 className="font-bold mb-3 text-slate-300">Leaderboard</h2>
              {players.length === 0 && <p className="text-sm text-slate-500">No players yet</p>}
              {players.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
                  <span className="text-sm">
                    <span className="text-slate-500 mr-2">#{i + 1}</span>
                    <span className="font-medium">{p.name}</span>
                    {p.streak > 1 && <span className="ml-2 text-xs text-orange-400">🔥{p.streak}</span>}
                  </span>
                  <span className="font-bold text-indigo-400">{p.score}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Centre: Current Question */}
          <div className="lg:col-span-2 space-y-6">
            {isEnded && (
              <div className="rounded-2xl bg-indigo-900 p-8 text-center space-y-4">
                <div className="text-4xl">🏆</div>
                <h2 className="text-2xl font-bold">Game Over!</h2>
                {players[0] && (
                  <p className="text-lg text-indigo-300">Winner: <span className="font-bold text-white">{players[0].name}</span> with {players[0].score} pts</p>
                )}
                <button onClick={() => router.push("/admin")} className="rounded-lg bg-white text-indigo-900 px-6 py-2 font-bold hover:bg-indigo-100">
                  Back to Dashboard
                </button>
              </div>
            )}

            {!isEnded && currentQ && (
              <div className="rounded-2xl bg-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Question {qIdx + 1} of {totalQ}
                  </span>
                  {isActive && live.timerEndsAt && (
                    <Countdown endsAt={live.timerEndsAt} />
                  )}
                </div>

                {currentQ.questionText && (
                  <p className="text-lg font-semibold">{currentQ.questionText}</p>
                )}

                {currentQ.mediaUrl && currentQ.mediaType === "image" && (
                  <img src={currentQ.mediaUrl} alt="puzzle" className="max-h-64 rounded-xl mx-auto" />
                )}
                {currentQ.mediaUrl && currentQ.mediaType === "audio" && (
                  <audio src={currentQ.mediaUrl} controls className="w-full" autoPlay />
                )}
                {currentQ.mediaUrl && currentQ.mediaType === "video" && (
                  <video src={currentQ.mediaUrl} controls autoPlay className="w-full max-h-56 rounded-xl" />
                )}

                {live.question?.hintRevealed && currentQ.hint && (
                  <div className="rounded-lg bg-yellow-900/40 border border-yellow-600 px-4 py-2 text-sm text-yellow-300">
                    Hint: {currentQ.hint}
                  </div>
                )}

                {live.question?.revealedAnswer && (
                  <div className="rounded-lg bg-emerald-900/40 border border-emerald-500 px-4 py-2 text-sm font-bold text-emerald-300">
                    Answer: {live.question.revealedAnswer}
                  </div>
                )}

                {live.firstCorrectWinner && (
                  <div className="rounded-lg bg-indigo-900/50 border border-indigo-500 px-4 py-2 text-sm text-indigo-300">
                    First correct: <span className="font-bold text-white">{live.firstCorrectWinner.playerName}</span> (+{live.firstCorrectWinner.points} pts)
                  </div>
                )}
              </div>
            )}

            {/* Live Submissions */}
            {!isLobby && !isEnded && (
              <div className="rounded-2xl bg-slate-800 p-5 space-y-3">
                <h2 className="font-bold text-slate-300">Live Answers ({submissions.length})</h2>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {submissions.length === 0 && <p className="text-sm text-slate-500">Waiting for answers...</p>}
                  {[...submissions].reverse().map((s) => (
                    <div
                      key={s.playerName + s.time}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                        s.isCorrect ? "bg-emerald-900/40 border border-emerald-700" : "bg-slate-700"
                      }`}
                    >
                      <div>
                        <span className="font-semibold text-indigo-300">{s.playerName}</span>
                        <span className="text-slate-300 ml-2">"{s.guess}"</span>
                      </div>
                      {s.isCorrect && (
                        <span className="text-xs font-bold text-emerald-400">✓ #{s.rank} +{s.pointsAwarded}pts</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Countdown({ endsAt }) {
  const [secs, setSecs] = useState(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setSecs(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [endsAt]);
  return (
    <span className={`font-mono font-bold text-lg ${secs <= 5 ? "text-red-400 animate-pulse" : "text-slate-300"}`}>
      {secs}s
    </span>
  );
}
