import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

// GET /api/games/[id]/live — fast live state read from Realtime DB
export async function GET(req, { params }) {
  const { id } = await params;
  const snap = await adminDb.ref(`liveGames/${id}`).get();
  if (!snap.exists()) return NextResponse.json({ status: "LOBBY", players: {} });
  return NextResponse.json(snap.val());
}
