import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebaseAdmin";

// GET /api/games — list all games
export async function GET() {
  const snap = await adminFirestore.collection("games").orderBy("createdAt", "desc").get();
  const games = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json(games);
}

// POST /api/games — create a new game
export async function POST(req) {
  const body = await req.json();
  const { title, template, questions, timePerQuestion } = body;

  if (!title || !questions?.length) {
    return NextResponse.json({ error: "Title and questions required" }, { status: 400 });
  }

  const code = String(Math.floor(1000 + Math.random() * 9000));

  const gameRef = await adminFirestore.collection("games").add({
    title,
    template: template || "rebus",
    questions,
    timePerQuestion: timePerQuestion || 30,
    code,
    status: "DRAFT", // DRAFT | LOBBY | ACTIVE | ENDED
    currentQuestion: -1,
    players: {},
    createdAt: Date.now(),
  });

  return NextResponse.json({ id: gameRef.id, code });
}

// PUT /api/games — update existing game
export async function PUT(req) {
  const body = await req.json();
  const { id, title, template, questions, timePerQuestion } = body;
  if (!id) return NextResponse.json({ error: "Game ID required" }, { status: 400 });
  await adminFirestore.collection("games").doc(id).update({ title, template, questions, timePerQuestion });
  return NextResponse.json({ ok: true });
}
