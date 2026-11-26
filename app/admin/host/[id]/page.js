"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { db } from "@/lib/firebase";
import { ref as dbRef, onValue } from "firebase/database";

const COLOUR_META = {
  red:    { bg: "bg-red-500",    border: "border-red-400",    label: "Red" },
  green:  { bg: "bg-green-500",  border: "border-green-400",  label: "Green" },
  yellow: { bg: "bg-yellow-400", border: "border-yellow-400", label: "Yellow" },
  blue:   { bg: "bg-blue-500",   border: "border-blue-400",   label: "Blue" },
};

export default function HostGamePage() {
  const { id } = useParams();
  const router = useRouter();
  const [game, setGame] = useState(null);
  const [live, setLive] = useState(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [secs, setSecs] = useState(null);
  const timerRef = useRef(null);

  // ── Load static game data once ────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/games/${id}`).then((r) => r.json()).then(setGame);
    setJoinUrl(`${window.location.origin}/play/${id}`);
  }, [id]);

  // ── Firebase Realtime listener for live state ─────────────────────────────
  useEffect(() => {
    const liveRef = dbRef(db, `liveGames/${id}`);
    const unsub = onValue(liveRef, (snap) => {
      setLive(snap.val() || { status: "LOBBY", players: {} });
    });
    return () => unsub();
  }, [id]);

  // ── Auto-advance countdown for non–colour_flash questions ─────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!live?.timerEndsAt || live.timerEndsAt === 0 || live.status !== "ACTIVE") return;
    if (game?.template === "colour_flash") return; // no auto-close for colour flash

    timerRef.current = setInterval(() => {
      const remaining = Math.ceil((live.timerEndsAt - Date.now()) / 1000);
      setSecs(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        doAction({ action: "CLOSE_QUESTION" });
      }
    }, 500);

    return () => clearInterval(timerRef.current);
  }, [live?.timerEndsAt, live?.status, game?.template]);

  const doAction = useCallback(async (payload) => {
    setLoading(true);
    const res = await fetch(`/api/games/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setLoading(false);
    return data;
  }, [id]);

  const handleRestart = async () => {
    if (!confirm("Restart with a new room code? All scores reset.")) return;
    await doAction({ action: "RESTART_GAME" });
  };

  if (!game || !live) return <div className="p-8 text-slate-500">Loading...</div>;

  const players = Object.values(live.players || {}).sort((a, b) => b.score - a.score);
  const qIdx = live.currentQuestion ?? -1;
  const currentQ = game.questions?.[qIdx];
  const totalQ = game.questions?.length || 0;
  const isLobby = !live.status || live.status === "LOBBY" || live.status === "DRAFT";
  const isActive = live.status === "ACTIVE";
  const isLeaderboard = live.status === "LEADERBOARD";
  const isEnded = live.status === "ENDED";
  const noTimer = !live.timerEndsAt || live.timerEndsAt === 0;
  const isColourFlash = game.template === "colour_flash";
  const submissions = Object.values(live.submissions || {});

  // Colour Flash: sorted tap list (non-removed first, by time)
  const taps = live.taps || {};
  const tapList = Object.entries(taps)
    .map(([key, t]) => ({ key, ...t, displayName: live.players?.[key]?.displayName || key }))
    .sort((a, b) => a.time - b.time);
  const activeTaps = tapList.filter((t) => !t.removed);
  const removedTaps = tapList.filter((t) => t.removed);

  return (
    <div className="min-h-screen bg-slate-900 p-4 text-white">
      <div className="mx-auto max-w-6xl space-y-5">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-800 p-4">
          <div>
            <h1 className="text-xl font-bold">{game.title}</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Code: <span className="font-mono text-lg font-bold text-indigo-400">{game.code}</span>
              {" · "}<span className="capitalize">{game.template?.replace("_", " ")}</span>
              {" · "}Status: <span className="font-semibold text-white">{live.status || "LOBBY"}</span>
              {qIdx >= 0 && ` · Q${qIdx + 1}/${totalQ}`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Non–colour_flash active controls */}
            {isActive && !isColourFlash && (
              <>
                <button onClick={() => doAction({ action: "REVEAL_HINT" })} disabled={loading || live.question?.hintRevealed}
                  className="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-yellow-400 disabled:opacity-40">
                  {live.question?.hintRevealed ? "Hint Shown" : "Reveal Hint"}
                </button>
                <button onClick={() => doAction({ action: "CLOSE_QUESTION" })} disabled={loading}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold hover:bg-amber-600 disabled:opacity-50">
                  Close Round
                </button>
                <button onClick={() => doAction({ action: "REVEAL_RESULT", correctAnswer: currentQ?.answer })} disabled={loading}
                  className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50">
                  Reveal Answer
                </button>
              </>
            )}

            {/* Colour Flash active controls */}
            {isActive && isColourFlash && (
              <>
                {!live.answerRevealed && (
                  <button onClick={() => doAction({ action: "REVEAL_ANSWER" })} disabled={loading}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50">
                    Reveal Answer Side
                  </button>
                )}
                <button onClick={() => doAction({ action: "CLOSE_QUESTION" })} disabled={loading}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold hover:bg-amber-600 disabled:opacity-50">
                  Close Round
                </button>
              </>
            )}

            {isLeaderboard && (
              <button onClick={() => doAction({ action: "NEXT_QUESTION" })} disabled={loading}
                className="rounded-lg bg-indigo-500 px-4 py-1.5 text-sm font-bold hover:bg-indigo-600 disabled:opacity-50">
                {qIdx + 1 >= totalQ - 1 ? "End Game →" : "Next Question →"}
              </button>
            )}
            {isEnded && (
              <button onClick={handleRestart} disabled={loading}
                className="rounded-lg bg-green-500 px-4 py-1.5 text-sm font-bold hover:bg-green-600 disabled:opacity-50">
                Restart Game
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">

          {/* ── Left column: QR / Players / Leaderboard ──────────────── */}
          <div className="space-y-5">
            <div className="rounded-2xl bg-slate-800 p-4 space-y-3">
              {isLobby && joinUrl && (
                <>
                  <div className="flex justify-center">
                    <div className="rounded-xl bg-white p-3"><QRCodeSVG value={joinUrl} size={150} /></div>
                  </div>
                  <p className="text-center text-xs text-slate-400 break-all">{joinUrl}</p>
                </>
              )}
              <div className="text-center">
                <span className="text-sm text-slate-400">Players joined: </span>
                <span className="font-bold text-indigo-400">{players.length}</span>
              </div>
              {isLobby && (
                <button onClick={() => doAction({ action: "START_GAME" })} disabled={loading || players.length === 0}
                  className="w-full rounded-xl bg-indigo-600 py-2.5 font-bold hover:bg-indigo-700 disabled:opacity-40">
                  {players.length === 0 ? "Waiting for players..." : "Start Game"}
                </button>
              )}
            </div>

            {/* Score leaderboard */}
            <div className="rounded-2xl bg-slate-800 p-4">
              <h2 className="font-bold mb-2 text-slate-300 text-sm">Score Leaderboard</h2>
              {players.length === 0 && <p className="text-sm text-slate-500">No players yet</p>}
              {players.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between py-1.5 border-b border-slate-700 last:border-0">
                  <span className="text-sm">
                    <span className="text-slate-500 mr-2">#{i + 1}</span>
                    <span className="font-medium">{p.displayName || p.name}</span>
                    {p.streak > 1 && <span className="ml-1.5 text-xs text-orange-400">🔥{p.streak}</span>}
                  </span>
                  <span className="font-bold text-indigo-400 text-sm">{p.score}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: Question + Live activity ──────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {isEnded && (
              <div className="rounded-2xl bg-indigo-900 p-8 text-center space-y-4">
                <div className="text-4xl">🏆</div>
                <h2 className="text-2xl font-bold">Game Over!</h2>
                {players[0] && <p className="text-lg text-indigo-300">Winner: <span className="font-bold text-white">{players[0].displayName || players[0].name}</span> — {players[0].score} pts</p>}
                <div className="flex justify-center gap-3">
                  <button onClick={handleRestart} className="rounded-lg bg-green-500 px-6 py-2 font-bold hover:bg-green-600">Restart</button>
                  <button onClick={() => router.push("/admin")} className="rounded-lg bg-white text-indigo-900 px-6 py-2 font-bold hover:bg-indigo-100">Dashboard</button>
                </div>
              </div>
            )}

            {!isEnded && currentQ && !isLobby && (
              <div className="rounded-2xl bg-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Q{qIdx + 1} / {totalQ}</span>
                  {isActive && !noTimer && !isColourFlash && (
                    <span className={`font-mono font-bold text-lg ${secs !== null && secs <= 5 ? "text-red-400 animate-pulse" : "text-slate-300"}`}>
                      {secs !== null ? `${secs}s` : ""}
                    </span>
                  )}
                  {currentQ.scoringEnabled === false && (
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">No scoring</span>
                  )}
                  {currentQ.multiAttempt && (
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">Multi-attempt</span>
                  )}
                </div>

                {/* ── Colour Flash question view ───────────────────────── */}
                {isColourFlash && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-700/50 p-3 space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Question Side</p>
                      {currentQ.questionText && (
                        <p className="text-white font-semibold text-base">{currentQ.questionText}</p>
                      )}
                      {currentQ.questionMediaUrl && currentQ.questionMediaType === "image" && (
                        <img src={currentQ.questionMediaUrl} alt="" className="max-h-48 rounded-lg mx-auto object-contain" loading="eager" />
                      )}
                      {!currentQ.questionText && !currentQ.questionMediaUrl && (
                        <p className="text-slate-500 text-sm italic">No question content</p>
                      )}
                    </div>
                    <div className="rounded-xl bg-slate-700/50 p-3 space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Answer Side</p>
                      {live.answerRevealed ? (
                        <>
                          {currentQ.answerText && <p className="text-white font-semibold text-base">{currentQ.answerText}</p>}
                          {currentQ.answerMediaUrl && currentQ.answerMediaType === "image" && (
                            <img src={currentQ.answerMediaUrl} alt="" className="max-h-48 rounded-lg mx-auto object-contain" />
                          )}
                          {!currentQ.answerText && !currentQ.answerMediaUrl && (
                            <p className="text-slate-500 text-sm italic">No answer content</p>
                          )}
                        </>
                      ) : (
                        <div className="flex h-28 items-center justify-center rounded-lg bg-slate-800 text-slate-500 text-sm italic">
                          Hidden — click "Reveal Answer Side" to show
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Correct colour indicator (colour flash) */}
                {isColourFlash && currentQ.correctColour && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">Correct colour:</span>
                    <div className={`h-8 w-8 rounded-lg ${COLOUR_META[currentQ.correctColour]?.bg}`} />
                    <span className="text-sm font-bold capitalize">{currentQ.correctColour}</span>
                  </div>
                )}

                {/* ── Standard question view (non colour_flash) ────────── */}
                {!isColourFlash && (
                  <>
                    {currentQ.questionText && <p className="text-lg font-semibold">{currentQ.questionText}</p>}
                    {currentQ.mediaUrl && currentQ.mediaType === "image" && (
                      <img src={currentQ.mediaUrl} alt="puzzle" className="max-h-64 rounded-xl mx-auto object-contain" loading="eager" />
                    )}
                    {currentQ.mediaUrl && currentQ.mediaType === "audio" && (
                      <audio src={currentQ.mediaUrl} controls className="w-full" autoPlay />
                    )}
                    {currentQ.mediaUrl && currentQ.mediaType === "video" && (
                      <video src={currentQ.mediaUrl} controls autoPlay className="w-full max-h-56 rounded-xl" />
                    )}
                    {live.question?.hintRevealed && currentQ.hint && (
                      <div className="rounded-lg bg-yellow-900/40 border border-yellow-600 px-3 py-2 text-sm text-yellow-300">
                        Hint: {currentQ.hint}
                      </div>
                    )}
                    {live.question?.revealedAnswer && (
                      <div className="rounded-lg bg-emerald-900/40 border border-emerald-500 px-3 py-2 text-sm font-bold text-emerald-300">
                        Answer: {live.question.revealedAnswer}
                      </div>
                    )}
                    {live.firstCorrectWinner && (
                      <div className="rounded-lg bg-indigo-900/50 border border-indigo-500 px-3 py-2 text-sm text-indigo-300">
                        First correct: <span className="font-bold text-white">{live.firstCorrectWinner.playerName}</span> (+{live.firstCorrectWinner.points} pts)
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Colour Flash: Tap-order panel ─────────────────────── */}
            {isColourFlash && !isLobby && !isEnded && (
              <div className="rounded-2xl bg-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-slate-300">Tap Order — {activeTaps.length} tapped</h2>
                  {live.winnerKey && (
                    <span className="rounded-full bg-yellow-500/20 border border-yellow-500 px-3 py-0.5 text-xs font-bold text-yellow-400">
                      Winner: {live.players?.[live.winnerKey]?.displayName || live.winnerKey}
                    </span>
                  )}
                </div>

                {activeTaps.length === 0 && (
                  <p className="text-sm text-slate-500">Waiting for players to tap...</p>
                )}

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {activeTaps.map((t, i) => {
                    const cm = COLOUR_META[t.colour] || {};
                    const isWinner = t.key === live.winnerKey;
                    return (
                      <div key={t.key}
                        className={`flex items-center justify-between rounded-xl px-4 py-3 ${isWinner ? "bg-yellow-900/40 border border-yellow-600" : "bg-slate-700"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 font-mono text-sm w-6">#{i + 1}</span>
                          <div className={`h-6 w-6 rounded-lg ${cm.bg || "bg-slate-500"} flex-shrink-0`} />
                          <span className="font-semibold text-sm">{t.displayName}</span>
                          {isWinner && <span className="text-yellow-400 text-sm">👑 Winner</span>}
                        </div>
                        {!live.winnerKey && isActive && (
                          <div className="flex gap-2">
                            <button onClick={() => doAction({ action: "MARK_WINNER", winnerKey: t.key })} disabled={loading}
                              className="rounded-lg bg-yellow-500 px-3 py-1 text-xs font-bold text-slate-900 hover:bg-yellow-400 disabled:opacity-50">
                              Mark Winner
                            </button>
                            <button onClick={() => doAction({ action: "REMOVE_TAPPER", tapperKey: t.key })} disabled={loading}
                              className="rounded-lg bg-red-700 px-3 py-1 text-xs font-bold hover:bg-red-600 disabled:opacity-50">
                              Wrong ✕
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {removedTaps.length > 0 && (
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer hover:text-slate-400">Removed ({removedTaps.length})</summary>
                    <div className="mt-1 space-y-1">
                      {removedTaps.map((t) => (
                        <div key={t.key} className="flex items-center gap-2 opacity-50">
                          <div className={`h-4 w-4 rounded ${COLOUR_META[t.colour]?.bg || "bg-slate-500"}`} />
                          <span>{t.displayName}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* ── Standard: Live Submissions ───────────────────────────── */}
            {!isColourFlash && !isLobby && !isEnded && (
              <div className="rounded-2xl bg-slate-800 p-5 space-y-3">
                <h2 className="font-bold text-slate-300">Live Answers ({submissions.length})</h2>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {submissions.length === 0 && <p className="text-sm text-slate-500">Waiting for answers...</p>}
                  {[...submissions].reverse().map((s) => (
                    <div key={s.playerName + s.time}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${s.isCorrect ? "bg-emerald-900/40 border border-emerald-700" : "bg-slate-700"}`}>
                      <div>
                        <span className="font-semibold text-indigo-300">{s.playerName}</span>
                        <span className="text-slate-300 ml-2">"{s.guess}"</span>
                      </div>
                      {s.isCorrect && <span className="text-xs font-bold text-emerald-400">✓ #{s.rank} +{s.pointsAwarded}pts</span>}
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
