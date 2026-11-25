"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_COLOR = {
  DRAFT: "bg-slate-200 text-slate-700",
  LOBBY: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  ENDED: "bg-red-100 text-red-700",
};

export default function AdminDashboard() {
  const router = useRouter();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json())
      .then((data) => { setGames(Array.isArray(data) ? data : []); setLoading(false); });
  }, []);

  const deleteGame = async (id) => {
    if (!confirm("Delete this game?")) return;
    await fetch(`/api/games/${id}`, { method: "DELETE" });
    setGames((gs) => gs.filter((g) => g.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Game Dashboard</h1>
          <button
            onClick={() => router.push("/admin/create")}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700"
          >
            + Create Game
          </button>
        </div>

        {loading && <p className="text-slate-500">Loading games...</p>}

        {!loading && games.length === 0 && (
          <div className="rounded-2xl bg-white p-10 text-center shadow">
            <div className="text-5xl mb-4">🎮</div>
            <p className="text-slate-500 mb-4">No games yet. Create your first one!</p>
            <button
              onClick={() => router.push("/admin/create")}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 font-semibold text-white hover:bg-indigo-700"
            >
              Create Game
            </button>
          </div>
        )}

        <div className="space-y-3">
          {games.map((g) => (
            <div key={g.id} className="rounded-2xl bg-white p-5 shadow flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h2 className="font-bold text-lg">{g.title}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[g.status] || STATUS_COLOR.DRAFT}`}>
                    {g.status || "DRAFT"}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  Code: <span className="font-mono font-bold text-indigo-600">{g.code}</span>
                  {" · "}{g.questions?.length || 0} questions
                  {" · "}{g.template}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/admin/host/${g.id}`)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  {g.status === "ACTIVE" ? "Back to Live" : "Host Game"}
                </button>
                <button
                  onClick={() => deleteGame(g.id)}
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
