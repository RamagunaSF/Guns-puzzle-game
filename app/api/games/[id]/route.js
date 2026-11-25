import { NextResponse } from "next/server";
import { adminFirestore, adminDb } from "@/lib/firebaseAdmin";

// GET /api/games/[id] — fetch a single game
export async function GET(req, { params }) {
  const { id } = await params;
  const doc = await adminFirestore.collection("games").doc(id).get();
  if (!doc.exists) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  return NextResponse.json({ id: doc.id, ...doc.data() });
}

// PATCH /api/games/[id] — update game (status, currentQuestion, etc.)
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  await adminFirestore.collection("games").doc(id).update(body);

  // Mirror live game state to Realtime DB for fast player polling
  if (body.status || body.currentQuestion !== undefined) {
    await adminDb.ref(`liveGames/${id}`).update(body);
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/games/[id]
export async function DELETE(req, { params }) {
  const { id } = await params;
  await adminFirestore.collection("games").doc(id).delete();
  await adminDb.ref(`liveGames/${id}`).remove();
  return NextResponse.json({ ok: true });
}
