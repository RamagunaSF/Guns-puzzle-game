"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { ref as dbRef, onValue } from "firebase/database";
import nextDynamic from "next/dynamic";

const DotLottiePlayer = nextDynamic(
  () => import("@dotlottie/react-player").then((m) => m.DotLottiePlayer),
  { ssr: false }
);

const POWERUP_META = {
  "2X": { label: "2X Points", icon: "⚡", color: "bg-yellow-500", desc: "Double points this round" },
  SUPERSONIC: { label: "Supersonic", icon: "🚀", color: "bg-blue-500", desc: "1.5× points for speed" },
  STREAK_BOOSTER: { label: "Streak Boost", icon: "🔥", color: "bg-orange-500", desc: "+5 pts per streak" },
  DOUBLE_JEOPARDY: { label: "Double Jeopardy", icon: "🎲", color: "bg-purple-500", desc: "2× if right, lose all if wrong" },
};

const COLOUR_BOXES = [
  { key: "red",    bg: "bg-red-500",    activeBorder: "ring-4 ring-red-200",    label: "Red" },
  { key: "green",  bg: "bg-green-500",  activeBorder: "ring-4 ring-green-200",  label: "Green" },
  { key: "yellow", bg: "bg-yellow-400", activeBorder: "ring-4 ring-yellow-200", label: "Yellow" },
  { key: "blue",   bg: "bg-blue-500",   activeBorder: "ring-4 ring-blue-200",   label: "Blue" },
];

// Stroop: text colour hex — must differ from box background
const STROOP_HEX = { red: "#ef4444", green: "#22c55e", yellow: "#facc15", blue: "#60a5fa" };

// Returns a colour key (and its hex) that is NOT the box's own colour
// Deterministic per (questionIdx, boxPosition) so all players see the same text
function stroopFor(boxKey, questionIdx, pos) {
  const others = COLOUR_BOXES.map((b) => b.key).filter((k) => k !== boxKey);
  const pick = others[(questionIdx * 3 + pos * 7) % others.length];
  return { label: COLOUR_BOXES.find((b) => b.key === pick).label, hex: STROOP_HEX[pick] };
}

const normalise = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

function buildLetterBoxes(answer) {
  return (answer || "").trim().split(/\s+/).filter(Boolean).map((w) => w.length);
}

// Fisher-Yates shuffle (stable per questionIdx seed)
function shuffleForQuestion(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = ((s * 1664525 + 1013904223) >>> 0);
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function PlayPage() {
  const { id } = useParams();
  const [phase, setPhase] = useState("join");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [live, setLive] = useState(null);
  const [game, setGame] = useState(null);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [activePowerup, setActivePowerup] = useState(null);
  const [playerData, setPlayerData] = useState(null);
  const [secs, setSecs] = useState(null);
  const [joining, setJoining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [showPowerupPicker, setShowPowerupPicker] = useState(false);
  const [tappedColour, setTappedColour] = useState(null); // for colour_flash
  const [visibleBoxes, setVisibleBoxes] = useState([]); // animated reveal
  const [showCelebration, setShowCelebration] = useState(false);
  const prevStatus = useRef(null);
  const prevQuestion = useRef(null);
  const prevBoxesRevealed = useRef(false);
  const nameRef = useRef("");

  // Fetch static game data once after join
  useEffect(() => {
    if (phase !== "lobby" && phase !== "playing" && phase !== "result" && phase !== "ended") return;
    fetch(`/api/games/${id}`).then((r) => r.json()).then(setGame);
  }, [id, phase]);

  // ── Firebase Realtime listener ────────────────────────────────────────────
  useEffect(() => {
    if (phase === "join") return;
    const liveRef = dbRef(db, `liveGames/${id}`);
    const unsub = onValue(liveRef, (snap) => {
      const data = snap.val() || { status: "LOBBY", players: {} };
      setLive(data);

      const currentName = nameRef.current;
      const player = data.players?.[currentName.toLowerCase()];
      if (player) setPlayerData(player);

      if (data.status === "ACTIVE" && prevStatus.current !== "ACTIVE") {
        setPhase("playing");
        setGuess("");
        setFeedback(null);
        setTappedColour(null);
        setActivePowerup(null);
        setShowPowerupPicker(false);
      }
      if (data.status === "LEADERBOARD" && prevStatus.current === "ACTIVE") {
        setPhase("result");
      }
      if (data.status === "ENDED") setPhase("ended");

      if (data.currentQuestion !== prevQuestion.current && data.currentQuestion !== undefined) {
        setGuess("");
        setFeedback(null);
        setTappedColour(null);
        setActivePowerup(null);
        setShowPowerupPicker(false);
        setImgLoaded(false);
        setVisibleBoxes([]);
        prevBoxesRevealed.current = false;
        if (data.status === "ACTIVE") setPhase("playing");
      }

      // Animate colour boxes in when admin reveals them
      if (data.colourBoxesRevealed && !prevBoxesRevealed.current) {
        prevBoxesRevealed.current = true;
        setVisibleBoxes([]);
        [0, 1, 2, 3].forEach((i) => {
          setTimeout(() => setVisibleBoxes((v) => [...v, i]), i * 130 + 80);
        });
      }
      if (!data.colourBoxesRevealed) {
        prevBoxesRevealed.current = false;
        setVisibleBoxes([]);
      }

      prevStatus.current = data.status;
      prevQuestion.current = data.currentQuestion;

      if (data.timerEndsAt) setSecs(Math.max(0, Math.ceil((data.timerEndsAt - Date.now()) / 1000)));
    });
    return () => unsub();
  }, [id, phase]);

  // Countdown ticker
  useEffect(() => {
    if (secs === null || secs <= 0) return;
    const t = setTimeout(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [secs]);

  const handleJoin = async () => {
    if (!name.trim() || !code.trim()) return setError("Enter your name and room code.");
    setJoining(true);
    setError("");
    const trimmedName = name.trim();
    const sessionKey = localStorage.getItem(`sessionKey_${id}_${trimmedName.toLowerCase()}`);
    const res = await fetch(`/api/games/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "JOIN", name: trimmedName, code: code.trim(), sessionKey }),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); setJoining(false); return; }
    if (data.sessionKey) localStorage.setItem(`sessionKey_${id}_${trimmedName.toLowerCase()}`, data.sessionKey);
    nameRef.current = trimmedName;
    setPhase("lobby");
    setJoining(false);
  };

  const handleSubmit = async () => {
    if (!guess.trim() || submitting || feedback?.type === "correct") return;

    // Optimistic client-side check
    const question = live?.question;
    const clientCorrect = Boolean(question?.answer) && normalise(guess) === normalise(question.answer);
    setFeedback(clientCorrect
      ? { type: "correct", msg: "Correct!", pts: "..." }
      : { type: "wrong", msg: "Not quite — try again!" }
    );
    if (!clientCorrect) { setGuess(""); return; }

    setSubmitting(true);
    const res = await fetch(`/api/games/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "SUBMIT_GUESS", playerName: name.toLowerCase(), guess: guess.trim(), activePowerup }),
    });
    const data = await res.json();
    if (data.isCorrect) {
      setFeedback({ type: "correct", msg: "Correct!", pts: data.points });
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 3000);
    } else if (data.locked) {
      setFeedback({ type: "locked", msg: "Already answered!" });
    }
    setSubmitting(false);
  };

  // ── Colour Flash: tap a colour ────────────────────────────────────────────
  const handleTapColour = async (colourKey) => {
    if (submitting) return;
    const multiAttempt = live?.question?.multiAttempt === true;
    if (!multiAttempt && tappedColour) return; // locked, already tapped

    setTappedColour(colourKey);
    setSubmitting(true);
    await fetch(`/api/games/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "TAP_COLOUR", playerName: name.toLowerCase(), colour: colourKey }),
    });
    setSubmitting(false);
  };

  // Shuffle colour boxes deterministically per question
  const shuffledBoxes = useMemo(() => {
    const qIdx = live?.currentQuestion ?? 0;
    return shuffleForQuestion(COLOUR_BOXES, qIdx + 1);
  }, [live?.currentQuestion]);

  const isColourFlash = game?.template === "colour_flash";
  const question = live?.question;
  const letterGroups = buildLetterBoxes(question?.answer || "");
  const hasAnsweredCorrectly = feedback?.type === "correct";

  // ── JOIN SCREEN ───────────────────────────────────────────────────────────
  if (phase === "join") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-5 rounded-2xl bg-white/10 backdrop-blur p-8 text-white">
          <div className="text-center">
            <div className="text-5xl mb-3">🧩</div>
            <h1 className="text-2xl font-bold">Join Game</h1>
            <p className="text-indigo-200 text-sm mt-1">Enter the room code to play</p>
          </div>
          <input className="w-full rounded-xl bg-white/20 px-4 py-3 text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()} />
          <input className="w-full rounded-xl bg-white/20 px-4 py-3 text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-indigo-400 font-mono text-lg tracking-widest text-center"
            placeholder="ROOM CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={4} onKeyDown={(e) => e.key === "Enter" && handleJoin()} />
          {error && <p className="text-red-300 text-sm text-center">{error}</p>}
          <button onClick={handleJoin} disabled={joining}
            className="w-full rounded-xl bg-indigo-500 py-3 font-bold text-white hover:bg-indigo-600 disabled:opacity-50 transition">
            {joining ? "Joining..." : "Join Game →"}
          </button>
        </div>
      </div>
    );
  }

  // ── LOBBY SCREEN ──────────────────────────────────────────────────────────
  if (phase === "lobby") {
    const playerCount = Object.keys(live?.players || {}).length;
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="text-center space-y-6 max-w-sm w-full">
          <div className="text-6xl animate-bounce">🎮</div>
          <h1 className="text-3xl font-bold">You're in!</h1>
          <div className="rounded-2xl bg-white/10 backdrop-blur p-6 space-y-2">
            <p className="text-indigo-200 text-sm">Playing as</p>
            <p className="text-2xl font-bold">{name}</p>
          </div>
          <div className="rounded-2xl bg-white/10 backdrop-blur p-4">
            <p className="text-indigo-200 text-sm mb-1">Players joined</p>
            <p className="text-4xl font-bold text-indigo-300">{playerCount}</p>
          </div>
          <div className="flex items-center gap-2 justify-center text-indigo-300">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
            <span className="text-sm">Waiting for host to start...</span>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3 justify-center max-w-xs">
          {Object.values(live?.players || {}).map((p) => (
            <div key={p.name} className="rounded-full bg-indigo-600/60 px-3 py-1.5 text-sm font-medium">
              {p.displayName || p.name}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── COLOUR FLASH PLAYING SCREEN ───────────────────────────────────────────
  if (phase === "playing" && isColourFlash) {
    const myTap = live?.taps?.[name.toLowerCase()];
    const isLocked = !question?.multiAttempt && (tappedColour || (myTap && !myTap.removed));
    const activeTapColour = tappedColour || myTap?.colour;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 flex flex-col text-white">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="text-sm text-indigo-300 font-medium">Q{(live?.currentQuestion ?? 0) + 1}</div>
          <div className="text-sm font-bold text-indigo-300">
            {playerData?.score ?? 0} pts
            {playerData?.streak > 1 && <span className="ml-1 text-orange-400">🔥{playerData.streak}</span>}
          </div>
        </div>

        {live?.timerEndsAt > 0 && <TimerBar endsAt={live.timerEndsAt} total={question?.timeLimit || 30} />}

        <div className="flex-1 flex flex-col items-center justify-center px-6 py-6 space-y-6">
          {!live?.colourBoxesRevealed ? (
            <div className="flex flex-col items-center gap-3">
              <div className="text-4xl animate-pulse">👀</div>
              <p className="text-indigo-200 text-sm text-center font-medium">Watch the host screen...</p>
              <p className="text-indigo-400 text-xs text-center">Colour boxes will appear when host reveals them</p>
            </div>
          ) : (
            <>
              {live?.correctColourRevealed ? (
                <p className="text-indigo-200 text-sm text-center font-medium">
                  Correct colour is now shown — did you get it?
                </p>
              ) : (
                <p className="text-indigo-200 text-sm text-center font-medium">Tap the correct colour!</p>
              )}

              {/* 2×2 colour box grid with pop-in animation */}
              <div className="grid grid-cols-2 gap-5 w-full max-w-xs">
                {shuffledBoxes.map((box, pos) => {
                  const isSelected = activeTapColour === box.key;
                  const qIdx = live?.currentQuestion ?? 0;
                  const stroop = stroopFor(box.key, qIdx, pos);
                  const isVisible = visibleBoxes.includes(pos);
                  const isCorrectBox = live?.correctColourRevealed && box.key === question?.correctColour;
                  return (
                    <button key={box.key}
                      onClick={() => handleTapColour(box.key)}
                      disabled={isLocked || submitting || !isVisible}
                      style={{
                        transform: isVisible ? "scale(1)" : "scale(0)",
                        opacity: isVisible ? 1 : 0,
                        transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease",
                      }}
                      className={`aspect-square rounded-2xl ${box.bg} shadow-2xl active:scale-95 flex items-center justify-center
                        ${isSelected ? `${box.activeBorder} scale-105` : "hover:opacity-100"}
                        ${isLocked && !isSelected ? "opacity-40 cursor-not-allowed" : ""}
                        ${isLocked ? "cursor-not-allowed" : "cursor-pointer"}
                        ${isCorrectBox ? "ring-4 ring-white ring-offset-2 ring-offset-transparent" : ""}`}
                    >
                      <span className="font-black text-2xl select-none drop-shadow-lg"
                        style={{ color: stroop.hex }}>
                        {stroop.label.toUpperCase()}
                      </span>
                      {isCorrectBox && (
                        <span className="absolute text-white text-2xl pointer-events-none">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {isLocked && (
                <div className="rounded-2xl bg-indigo-600/30 border border-indigo-500 px-6 py-3 text-center">
                  <p className="font-bold text-indigo-200">Tapped! Waiting for host...</p>
                  <div className={`mx-auto mt-2 h-5 w-5 rounded-full ${COLOUR_BOXES.find(b => b.key === activeTapColour)?.bg || "bg-slate-500"}`} />
                </div>
              )}
            </>
          )}

          {question?.multiAttempt && activeTapColour && (
            <p className="text-xs text-indigo-300">Multi-attempt — tap again to change</p>
          )}
        </div>
      </div>
    );
  }

  // ── STANDARD PLAYING SCREEN ───────────────────────────────────────────────
  if (phase === "playing" && question) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 flex flex-col text-white relative overflow-hidden">
        {/* Lottie celebration overlay */}
        {showCelebration && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
            <DotLottiePlayer
              src="https://lottie.host/d7af2f2c-ee64-4f3e-8a6c-73c6f7b0d7fc/8sJGEsyEMl.lottie"
              autoplay
              loop={false}
              style={{ width: 320, height: 320 }}
            />
          </div>
        )}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="text-sm text-indigo-300 font-medium">Q{(live?.currentQuestion ?? 0) + 1}</div>
          <div className={`font-mono font-bold text-xl ${secs !== null && secs <= 5 ? "text-red-400 animate-pulse" : "text-white"}`}>
            {secs !== null && live?.timerEndsAt ? `${secs}s` : ""}
          </div>
          <div className="text-sm font-bold text-indigo-300">
            {playerData?.score ?? 0} pts
            {playerData?.streak > 1 && <span className="ml-1 text-orange-400">🔥{playerData.streak}</span>}
          </div>
        </div>

        {live?.timerEndsAt > 0 && <TimerBar endsAt={live.timerEndsAt} total={question.timeLimit || 30} />}

        <div className="flex-1 flex flex-col items-center px-4 py-4 space-y-5">
          {question.mediaUrl && question.mediaType === "image" && (
            <div className="relative w-full flex justify-center">
              {!imgLoaded && (
                <div className="w-full max-h-56 h-48 rounded-2xl bg-indigo-900/50 animate-pulse flex items-center justify-center">
                  <span className="text-indigo-400 text-sm">Loading...</span>
                </div>
              )}
              <img src={question.mediaUrl} alt="puzzle" loading="eager" fetchPriority="high"
                onLoad={() => setImgLoaded(true)}
                className={`max-h-56 rounded-2xl shadow-2xl object-contain transition-opacity duration-200 ${imgLoaded ? "opacity-100" : "opacity-0 absolute"}`} />
            </div>
          )}
          {question.mediaUrl && question.mediaType === "audio" && (
            <div className="w-full rounded-2xl bg-indigo-900/50 p-4">
              <audio src={question.mediaUrl} controls autoPlay className="w-full" />
            </div>
          )}
          {question.mediaUrl && question.mediaType === "video" && (
            <video src={question.mediaUrl} controls autoPlay className="w-full max-h-48 rounded-2xl" />
          )}

          {question.questionText && <p className="text-center text-lg font-semibold text-white/90">{question.questionText}</p>}

          {question.hintRevealed && question.hint && (
            <div className="w-full rounded-xl bg-yellow-500/20 border border-yellow-500 px-4 py-2 text-sm text-yellow-300 text-center">
              💡 Hint: {question.hint}
            </div>
          )}

          {letterGroups.length > 0 && (
            <div className="flex flex-wrap justify-center gap-4">
              {letterGroups.map((count, wi) => (
                <div key={wi} className="flex gap-1.5">
                  {Array.from({ length: count }).map((_, li) => {
                    const flat = letterGroups.slice(0, wi).reduce((a, b) => a + b, 0) + li;
                    const revealed = question.revealedAnswer ? (question.revealedAnswer.replace(/\s/g, ""))[flat] || "" : "";
                    return (
                      <div key={li} className={`flex h-10 w-8 items-center justify-center rounded-lg border-2 font-bold text-base transition-all duration-300 ${
                        revealed ? "border-emerald-400 bg-emerald-500 text-white scale-110" : "border-indigo-400 bg-indigo-900/50 text-indigo-200"
                      }`}>
                        {revealed || "_"}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {!hasAnsweredCorrectly && playerData?.powerups?.length > 0 && (
            <div className="w-full">
              <button onClick={() => setShowPowerupPicker((v) => !v)}
                className="w-full rounded-xl bg-white/10 py-2 text-sm font-semibold text-white/80 hover:bg-white/20">
                {activePowerup ? `⚡ ${POWERUP_META[activePowerup]?.label} active` : "Use a Power-up?"}
              </button>
              {showPowerupPicker && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {playerData.powerups.map((pu) => {
                    const m = POWERUP_META[pu];
                    return (
                      <button key={pu}
                        onClick={() => { setActivePowerup(pu === activePowerup ? null : pu); setShowPowerupPicker(false); }}
                        className={`rounded-xl p-3 text-left text-white transition ${activePowerup === pu ? `${m.color}` : "bg-white/10 hover:bg-white/20"}`}>
                        <div className="text-xl">{m.icon}</div>
                        <div className="text-xs font-bold mt-1">{m.label}</div>
                        <div className="text-xs text-white/70">{m.desc}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!hasAnsweredCorrectly && (
            <div className="w-full space-y-3">
              <input
                className="w-full rounded-xl bg-white/15 px-4 py-3 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-indigo-400 text-lg"
                placeholder="Type your answer..."
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoComplete="off"
                autoFocus
              />
              <button onClick={handleSubmit} disabled={!guess.trim() || submitting}
                className="w-full rounded-xl bg-indigo-500 py-3 font-bold text-white hover:bg-indigo-600 disabled:opacity-40 transition active:scale-95">
                Submit Answer
              </button>
            </div>
          )}

          {feedback && (
            <div className={`w-full rounded-2xl p-4 text-center font-bold text-lg ${
              feedback.type === "correct" ? "bg-emerald-500/30 border border-emerald-400 text-emerald-300"
              : feedback.type === "wrong" ? "bg-red-500/20 border border-red-400 text-red-300"
              : "bg-yellow-500/20 border border-yellow-400 text-yellow-300"
            }`}>
              {feedback.type === "correct" ? "✅" : feedback.type === "wrong" ? "❌" : "🔒"} {feedback.msg}
              {feedback.pts && feedback.pts !== "..." && <span className="ml-2 text-base">+{feedback.pts} pts</span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── RESULT / LEADERBOARD ──────────────────────────────────────────────────
  if (phase === "result") {
    const players = Object.values(live?.players || {}).sort((a, b) => b.score - a.score);
    const myRank = players.findIndex((p) => p.name === name.toLowerCase()) + 1;
    const iAmWinner = isColourFlash && live?.winnerKey === name.toLowerCase();
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center p-4 text-white relative overflow-hidden">
        {/* Lottie winner celebration */}
        {iAmWinner && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
            <DotLottiePlayer
              src="https://lottie.host/d7af2f2c-ee64-4f3e-8a6c-73c6f7b0d7fc/8sJGEsyEMl.lottie"
              autoplay
              loop={false}
              style={{ width: 400, height: 400 }}
            />
          </div>
        )}
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center space-y-2">
            <div className="text-5xl">{feedback?.type === "correct" ? "🎉" : "📊"}</div>
            <h2 className="text-2xl font-bold">Round Over</h2>
            {live?.question?.revealedAnswer && (
              <p className="text-indigo-200 text-sm">Answer: <span className="font-bold text-white">{live.question.revealedAnswer}</span></p>
            )}
            {isColourFlash && live?.winnerKey && (
              <p className="text-yellow-300 font-bold">
                👑 Winner: {live.players?.[live.winnerKey]?.displayName || live.winnerKey}
              </p>
            )}
            {isColourFlash && !live?.winnerKey && live?.status === "LEADERBOARD" && (
              <div className="rounded-xl bg-white/10 px-4 py-3 text-center space-y-1">
                <p className="text-2xl">🫠</p>
                <p className="font-bold text-white">Nobody got it right!</p>
                <p className="text-indigo-300 text-xs">The correct colour weeps alone...</p>
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-white/10 backdrop-blur p-4 text-center">
            <p className="text-indigo-200 text-sm">Your rank</p>
            <p className="text-4xl font-bold">#{myRank || "—"}</p>
            <p className="text-indigo-300 mt-1">{playerData?.score ?? 0} pts total</p>
          </div>
          <div className="rounded-2xl bg-white/10 backdrop-blur p-4 space-y-2">
            {players.slice(0, 5).map((p, i) => (
              <div key={p.name} className={`flex justify-between text-sm py-1 ${p.name === name.toLowerCase() ? "font-bold text-indigo-300" : ""}`}>
                <span>#{i + 1} {p.displayName || p.name}</span>
                <span>{p.score} pts</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 justify-center text-indigo-300">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
            <span className="text-sm">Waiting for next question...</span>
          </div>
        </div>
      </div>
    );
  }

  // ── ENDED ─────────────────────────────────────────────────────────────────
  if (phase === "ended") {
    const players = Object.values(live?.players || {}).sort((a, b) => b.score - a.score);
    const myRank = players.findIndex((p) => p.name === name.toLowerCase()) + 1;
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-full max-w-sm space-y-5 text-center">
          <div className="text-6xl">{myRank === 1 ? "🏆" : "🎮"}</div>
          <h1 className="text-3xl font-bold">Game Over!</h1>
          <div className="rounded-2xl bg-white/10 backdrop-blur p-5 space-y-1">
            <p className="text-indigo-200 text-sm">Your final rank</p>
            <p className="text-5xl font-bold">#{myRank || "—"}</p>
            <p className="text-indigo-300">{playerData?.score ?? 0} pts</p>
          </div>
          <div className="rounded-2xl bg-white/10 backdrop-blur p-4 space-y-2">
            <p className="text-sm font-semibold text-indigo-300 mb-2">Final Leaderboard — Top 10</p>
            {players.slice(0, 10).map((p, i) => (
              <div key={p.name} className={`flex justify-between text-sm py-1 ${p.name === name.toLowerCase() ? "font-bold text-yellow-300" : ""}`}>
                <span>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`} {p.displayName || p.name}</span>
                <span>{p.score} pts</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;
}

function TimerBar({ endsAt, total }) {
  const [pct, setPct] = useState(100);
  useEffect(() => {
    const tick = () => setPct((Math.max(0, endsAt - Date.now()) / (total * 1000)) * 100);
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [endsAt, total]);
  return (
    <div className="h-1.5 w-full bg-slate-700">
      <div className={`h-full transition-all duration-200 ${pct > 50 ? "bg-indigo-400" : pct > 20 ? "bg-yellow-400" : "bg-red-500"}`}
        style={{ width: `${pct}%` }} />
    </div>
  );
}
