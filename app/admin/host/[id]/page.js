"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { db } from "@/lib/firebase";
import { ref as dbRef, onValue } from "firebase/database";

const COLOUR_META = {
  red:    { bg: "bg-red-500",    text: "text-red-700",    border: "border-red-300",    light: "bg-red-50",    label: "Red" },
  green:  { bg: "bg-green-500",  text: "text-green-700",  border: "border-green-300",  light: "bg-green-50",  label: "Green" },
  yellow: { bg: "bg-yellow-400", text: "text-yellow-700", border: "border-yellow-300", light: "bg-yellow-50", label: "Yellow" },
  blue:   { bg: "bg-blue-500",   text: "text-blue-700",   border: "border-blue-300",   light: "bg-blue-50",   label: "Blue" },
};

// Preload an image URL in background so it's cached before display
function preloadImage(url) {
  if (!url || typeof window === "undefined") return;
  const img = new window.Image();
  img.src = url;
}

export default function HostGamePage() {
  const { id } = useParams();
  const router = useRouter();
  const [game, setGame] = useState(null);
  const [live, setLive] = useState(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [secs, setSecs] = useState(null);
  const [showCorrectColour, setShowCorrectColour] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const timerRef = useRef(null);
  const prevQIdx = useRef(-1);

  // Load static game data once
  useEffect(() => {
    fetch(`/api/games/${id}`).then((r) => r.json()).then((g) => {
      setGame(g);
      // Preload all question images immediately
      (g.questions || []).forEach((q) => {
        preloadImage(q.mediaUrl);
        preloadImage(q.questionMediaUrl);
        preloadImage(q.answerMediaUrl);
      });
    });
    setJoinUrl(`${window.location.origin}/play/${id}`);
  }, [id]);

  // Firebase Realtime listener
  useEffect(() => {
    const liveRef = dbRef(db, `liveGames/${id}`);
    const unsub = onValue(liveRef, (snap) => {
      const data = snap.val() || { status: "LOBBY", players: {} };
      setLive(data);
      if (data.currentQuestion !== prevQIdx.current) {
        setShowCorrectColour(false);
        prevQIdx.current = data.currentQuestion;
      }
    });
    return () => unsub();
  }, [id]);

  // Auto-advance countdown (non colour_flash only)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!live?.timerEndsAt || live.timerEndsAt === 0 || live.status !== "ACTIVE") return;
    if (game?.template === "colour_flash") return;

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

  const handleCloseGame = async () => {
    await doAction({ action: "CLOSE_GAME" });
    setShowCloseConfirm(false);
  };

  const handleRestart = async () => {
    if (!confirm("Restart with a new room code? All scores reset.")) return;
    await doAction({ action: "RESTART_GAME" });
  };

  if (!game || !live) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-sm font-medium">Loading game...</p>
        </div>
      </div>
    );
  }

  const players = Object.values(live.players || {}).sort((a, b) => b.score - a.score);
  const qIdx = live.currentQuestion ?? -1;
  const currentQ = game.questions?.[qIdx];
  const nextQ = game.questions?.[qIdx + 1];
  const totalQ = game.questions?.length || 0;
  const isLobby = !live.status || live.status === "LOBBY" || live.status === "DRAFT";
  const isActive = live.status === "ACTIVE";
  const isLeaderboard = live.status === "LEADERBOARD";
  const isEnded = live.status === "ENDED";
  const noTimer = !live.timerEndsAt || live.timerEndsAt === 0;
  const isColourFlash = game.template === "colour_flash";
  const submissions = Object.values(live.submissions || {});

  // Preload next question image while current is showing
  if (nextQ) {
    preloadImage(nextQ.mediaUrl);
    preloadImage(nextQ.questionMediaUrl);
    preloadImage(nextQ.answerMediaUrl);
  }

  const taps = live.taps || {};
  const tapList = Object.entries(taps)
    .map(([key, t]) => ({ key, ...t, displayName: live.players?.[key]?.displayName || key }))
    .sort((a, b) => a.time - b.time);
  const activeTaps = tapList.filter((t) => !t.removed);
  const removedTaps = tapList.filter((t) => t.removed);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ── Top Navigation Bar ───────────────────────────────────────────── */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-black text-sm">G</div>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight">{game.title}</h1>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="capitalize">{game.template?.replace("_", " ")}</span>
                <span>·</span>
                <span>Code: <span className="font-mono font-bold text-blue-600">{game.code}</span></span>
                {qIdx >= 0 && <><span>·</span><span>Q{qIdx + 1}/{totalQ}</span></>}
                <span>·</span>
                <span className={`font-semibold ${isActive ? "text-green-600" : isLeaderboard ? "text-amber-600" : isEnded ? "text-slate-500" : "text-blue-600"}`}>
                  {live.status || "LOBBY"}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Non–colour_flash active controls */}
            {isActive && !isColourFlash && (
              <>
                <button onClick={() => doAction({ action: "REVEAL_HINT" })}
                  disabled={loading || live.question?.hintRevealed}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-40">
                  {live.question?.hintRevealed ? "Hint Shown" : "Reveal Hint"}
                </button>
                <button onClick={() => doAction({ action: "REVEAL_RESULT", correctAnswer: currentQ?.answer })}
                  disabled={loading}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                  Reveal Answer
                </button>
              </>
            )}

            {/* Colour Flash active controls */}
            {isActive && isColourFlash && (
              <>
                {!live.answerRevealed && (
                  <button onClick={() => doAction({ action: "REVEAL_ANSWER" })}
                    disabled={loading}
                    className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                    Show Answer →
                  </button>
                )}
                <button
                  onClick={async () => {
                    await doAction({ action: "REVEAL_CORRECT_COLOUR" });
                    setShowCorrectColour(true);
                  }}
                  disabled={loading || live.correctColourRevealed}
                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
                  {live.correctColourRevealed ? "✓ Colour Revealed" : "Reveal Correct Colour"}
                </button>
              </>
            )}

            {isLeaderboard && (
              <button onClick={() => doAction({ action: "NEXT_QUESTION" })}
                disabled={loading}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm">
                {qIdx + 1 >= totalQ ? "End Game →" : "Next Question →"}
              </button>
            )}

            {isEnded && (
              <button onClick={handleRestart}
                disabled={loading}
                className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 shadow-sm">
                Restart Game
              </button>
            )}

            {/* Close Game — always visible except ended */}
            {!isEnded && !isLobby && (
              <button onClick={() => setShowCloseConfirm(true)}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-100">
                Close Game
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Close Game Confirm Modal ─────────────────────────────────────── */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <div className="text-4xl">⚠️</div>
              <h2 className="font-bold text-lg text-slate-900">Close this game?</h2>
              <p className="text-sm text-slate-500">All players will be taken to the final leaderboard. This cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCloseConfirm(false)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleCloseGame} disabled={loading}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                {loading ? "Closing..." : "Close Game"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl p-5 space-y-5">
        <div className="grid gap-5 lg:grid-cols-3">

          {/* ── Left column ────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* QR / Join card */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-3">
              {isLobby && joinUrl && (
                <>
                  <div className="flex justify-center">
                    <div className="rounded-xl bg-white border border-slate-100 p-3 shadow-sm">
                      <QRCodeSVG value={joinUrl} size={150} />
                    </div>
                  </div>
                  <p className="text-center text-xs text-slate-400 break-all">{joinUrl}</p>
                </>
              )}
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-center">
                <p className="text-xs text-blue-500 font-medium mb-0.5">Room Code</p>
                <p className="font-mono text-3xl font-black text-blue-700 tracking-widest">{game.code}</p>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Players joined</span>
                <span className="font-bold text-blue-600 text-lg">{players.length}</span>
              </div>
              {isLobby && (
                <button onClick={() => doAction({ action: "START_GAME" })}
                  disabled={loading || players.length === 0}
                  className="w-full rounded-xl bg-blue-600 py-2.5 font-bold text-white hover:bg-blue-700 disabled:opacity-40 shadow-sm">
                  {players.length === 0 ? "Waiting for players..." : "▶ Start Game"}
                </button>
              )}
            </div>

            {/* Score leaderboard */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
              <h2 className="font-bold mb-3 text-slate-700 text-sm uppercase tracking-wider">Leaderboard</h2>
              {players.length === 0 && <p className="text-sm text-slate-400">No players yet</p>}
              {players.map((p, i) => (
                <div key={p.name} className={`flex items-center justify-between py-2 border-b border-slate-100 last:border-0 ${i === 0 ? "text-blue-700" : ""}`}>
                  <span className="text-sm flex items-center gap-2">
                    <span className={`w-5 text-center text-xs font-bold ${i === 0 ? "text-amber-500" : "text-slate-400"}`}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                    </span>
                    <span className="font-medium">{p.displayName || p.name}</span>
                    {p.streak > 1 && <span className="text-xs text-orange-500">🔥{p.streak}</span>}
                  </span>
                  <span className={`font-bold text-sm ${i === 0 ? "text-blue-600" : "text-slate-600"}`}>{p.score}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: Question + Live activity ────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Game ended screen */}
            {isEnded && (
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-8 text-center space-y-4">
                <div className="text-5xl">🏆</div>
                <h2 className="text-2xl font-bold text-slate-900">Game Over!</h2>
                {players[0] && (
                  <p className="text-lg text-slate-600">
                    Winner: <span className="font-bold text-blue-600">{players[0].displayName || players[0].name}</span>
                    <span className="text-slate-500 ml-1">— {players[0].score} pts</span>
                  </p>
                )}
                <div className="flex justify-center gap-3">
                  <button onClick={handleRestart}
                    className="rounded-xl bg-green-600 px-6 py-2.5 font-bold text-white hover:bg-green-700 shadow-sm">
                    Restart
                  </button>
                  <button onClick={() => router.push("/admin")}
                    className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 font-bold text-slate-700 hover:bg-slate-50">
                    Dashboard
                  </button>
                </div>
              </div>
            )}

            {/* Current question card */}
            {!isEnded && currentQ && !isLobby && (
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                      Q{qIdx + 1} / {totalQ}
                    </span>
                    {currentQ.scoringEnabled === false && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">No scoring</span>
                    )}
                    {currentQ.multiAttempt && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Multi-attempt</span>
                    )}
                  </div>
                  {isActive && !noTimer && !isColourFlash && (
                    <span className={`font-mono font-bold text-xl ${secs !== null && secs <= 5 ? "text-red-500 animate-pulse" : "text-slate-700"}`}>
                      {secs !== null ? `${secs}s` : ""}
                    </span>
                  )}
                </div>

                {/* ── Colour Flash: Question / Answer panel ─────────────── */}
                {isColourFlash && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                    {!live.answerRevealed ? (
                      <>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Question</p>
                        {currentQ.questionText && (
                          <p className="text-slate-900 font-semibold text-lg">{currentQ.questionText}</p>
                        )}
                        {currentQ.questionMediaUrl && currentQ.questionMediaType === "image" && (
                          <img src={currentQ.questionMediaUrl} alt="" className="max-h-56 rounded-xl mx-auto object-contain" loading="eager" />
                        )}
                        {currentQ.questionMediaUrl && (currentQ.questionMediaType === "video" || currentQ.questionMediaType === "mov") && (
                          <video src={currentQ.questionMediaUrl} controls className="w-full max-h-56 rounded-xl" />
                        )}
                        {!currentQ.questionText && !currentQ.questionMediaUrl && (
                          <p className="text-slate-400 text-sm italic">No question content</p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Answer</p>
                        {currentQ.answerText && (
                          <p className="text-slate-900 font-semibold text-lg">{currentQ.answerText}</p>
                        )}
                        {currentQ.answerMediaUrl && currentQ.answerMediaType === "image" && (
                          <img src={currentQ.answerMediaUrl} alt="" className="max-h-56 rounded-xl mx-auto object-contain" loading="eager" />
                        )}
                        {currentQ.answerMediaUrl && (currentQ.answerMediaType === "video" || currentQ.answerMediaType === "mov") && (
                          <video src={currentQ.answerMediaUrl} controls className="w-full max-h-56 rounded-xl" />
                        )}
                        {!currentQ.answerText && !currentQ.answerMediaUrl && (
                          <p className="text-slate-400 text-sm italic">No answer content</p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Correct colour display (shown when revealed) */}
                {isColourFlash && currentQ.correctColour && showCorrectColour && (
                  <div className={`flex items-center gap-3 rounded-xl border ${COLOUR_META[currentQ.correctColour]?.border} ${COLOUR_META[currentQ.correctColour]?.light} px-4 py-3`}>
                    <div className={`h-8 w-8 rounded-lg ${COLOUR_META[currentQ.correctColour]?.bg} shadow-sm`} />
                    <span className={`font-bold capitalize ${COLOUR_META[currentQ.correctColour]?.text}`}>
                      Correct: {currentQ.correctColour}
                    </span>
                  </div>
                )}

                {/* ── Standard question view ────────────────────────────── */}
                {!isColourFlash && (
                  <>
                    {currentQ.questionText && (
                      <p className="text-lg font-semibold text-slate-900">{currentQ.questionText}</p>
                    )}
                    {currentQ.mediaUrl && currentQ.mediaType === "image" && (
                      <img src={currentQ.mediaUrl} alt="puzzle"
                        className="max-h-64 rounded-xl mx-auto object-contain shadow-sm"
                        loading="eager" />
                    )}
                    {currentQ.mediaUrl && currentQ.mediaType === "audio" && (
                      <audio src={currentQ.mediaUrl} controls autoPlay className="w-full" />
                    )}
                    {currentQ.mediaUrl && currentQ.mediaType === "video" && (
                      <video src={currentQ.mediaUrl} controls autoPlay className="w-full max-h-56 rounded-xl" />
                    )}

                    {/* Answer letter boxes — blank, same structure players see */}
                    {currentQ.answer && (
                      <div className="flex flex-wrap gap-4 justify-center py-2">
                        {currentQ.answer.trim().split(/\s+/).filter(Boolean).map((word, wi) => (
                          <div key={wi} className="flex gap-1.5">
                            {word.split("").map((_, li) => (
                              <div key={li}
                                className="flex h-10 w-8 items-center justify-center rounded-lg border-2 border-slate-300 bg-white font-bold text-base text-slate-300 shadow-sm">
                                _
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    {live.question?.hintRevealed && currentQ.hint && (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
                        💡 Hint: {currentQ.hint}
                      </div>
                    )}
                    {live.question?.revealedAnswer && (
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm font-bold text-emerald-700">
                        ✓ Answer: {live.question.revealedAnswer}
                      </div>
                    )}
                    {live.firstCorrectWinner && (
                      <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700">
                        First correct: <span className="font-bold">{live.firstCorrectWinner.playerName}</span> (+{live.firstCorrectWinner.points} pts)
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Colour Flash: Tap-order panel ─────────────────────────── */}
            {isColourFlash && !isLobby && !isEnded && (
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wider">
                    Tap Order — {activeTaps.length} tapped
                  </h2>
                  {live.winnerKey && (
                    <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-0.5 text-xs font-bold text-amber-700">
                      👑 {live.players?.[live.winnerKey]?.displayName || live.winnerKey}
                    </span>
                  )}
                </div>

                {activeTaps.length === 0 && isActive && (
                  <p className="text-sm text-slate-400">Waiting for players to tap...</p>
                )}
                {activeTaps.length === 0 && isLeaderboard && !live.winnerKey && (
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-center space-y-1">
                    <p className="text-2xl">🫠</p>
                    <p className="font-bold text-slate-700">Nobody tapped anything!</p>
                    <p className="text-xs text-slate-400">The correct colour is offended.</p>
                  </div>
                )}

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {activeTaps.map((t, i) => {
                    const cm = COLOUR_META[t.colour] || {};
                    const isWinner = t.key === live.winnerKey;
                    const isCorrectColour = currentQ?.correctColour && t.colour === currentQ.correctColour;
                    return (
                      <div key={t.key}
                        className={`flex items-center justify-between rounded-xl px-4 py-3 border transition ${
                          isWinner
                            ? "bg-amber-50 border-amber-200"
                            : isCorrectColour
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-slate-50 border-slate-100 hover:border-slate-200"
                        }`}>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 font-mono text-sm w-6">#{i + 1}</span>
                          <div className={`h-6 w-6 rounded-lg ${cm.bg || "bg-slate-400"} shadow-sm flex-shrink-0`} />
                          <span className="font-semibold text-sm text-slate-800">{t.displayName}</span>
                          {isWinner && <span className="text-amber-600 text-sm font-bold">👑 Winner</span>}
                          {!isWinner && isCorrectColour && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">✓ Correct</span>
                          )}
                          {!isWinner && !isCorrectColour && currentQ?.correctColour && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-400">✗ Wrong colour</span>
                          )}
                        </div>
                        {!live.winnerKey && isActive && (
                          <div className="flex gap-2">
                            <button onClick={() => doAction({ action: "MARK_WINNER", winnerKey: t.key })}
                              disabled={loading}
                              className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-white hover:bg-amber-400 disabled:opacity-50 shadow-sm">
                              Mark Winner
                            </button>
                            <button onClick={() => doAction({ action: "REMOVE_TAPPER", tapperKey: t.key })}
                              disabled={loading}
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50">
                              Wrong ✕
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {removedTaps.length > 0 && (
                  <details className="text-xs text-slate-400">
                    <summary className="cursor-pointer hover:text-slate-600">Removed ({removedTaps.length})</summary>
                    <div className="mt-1 space-y-1">
                      {removedTaps.map((t) => (
                        <div key={t.key} className="flex items-center gap-2 opacity-50">
                          <div className={`h-4 w-4 rounded ${COLOUR_META[t.colour]?.bg || "bg-slate-400"}`} />
                          <span>{t.displayName}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* ── Standard: Live Submissions ─────────────────────────────── */}
            {!isColourFlash && !isLobby && !isEnded && (
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-3">
                <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wider">
                  Live Answers ({submissions.length})
                </h2>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {submissions.length === 0 && <p className="text-sm text-slate-400">Waiting for answers...</p>}
                  {[...submissions].reverse().map((s) => (
                    <div key={s.playerName + s.time}
                      className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm border ${
                        s.isCorrect
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-slate-50 border-slate-100"
                      }`}>
                      <div>
                        <span className="font-semibold text-blue-600">{s.playerName}</span>
                        <span className="text-slate-600 ml-2">"{s.guess}"</span>
                      </div>
                      {s.isCorrect && (
                        <span className="text-xs font-bold text-emerald-600">✓ #{s.rank} +{s.pointsAwarded}pts</span>
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
