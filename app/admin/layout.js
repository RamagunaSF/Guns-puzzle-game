"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";

const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || "1234";

export default function AdminLayout({ children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionStorage.getItem("admin_unlocked") === "true") setUnlocked(true);
  }, []);

  const handleUnlock = () => {
    if (pin === ADMIN_PIN) {
      sessionStorage.setItem("admin_unlocked", "true");
      setUnlocked(true);
    } else {
      setError("Wrong PIN. Try again.");
      setPin("");
    }
  };

  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="w-full max-w-xs space-y-5 rounded-2xl bg-white/10 backdrop-blur p-8 text-white text-center">
        <div className="text-5xl">🔐</div>
        <h1 className="text-xl font-bold">Admin Access</h1>
        <input
          type="password"
          className="w-full rounded-xl bg-white/20 px-4 py-3 text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-indigo-400 text-center text-2xl tracking-widest"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
          maxLength={8}
          autoFocus
        />
        {error && <p className="text-red-300 text-sm">{error}</p>}
        <button
          onClick={handleUnlock}
          className="w-full rounded-xl bg-indigo-500 py-3 font-bold text-white hover:bg-indigo-600"
        >
          Unlock
        </button>
      </div>
    </div>
  );
}
