import { NextResponse } from "next/server";
import { adminStorage } from "@/lib/firebaseAdmin";

export async function POST(req) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `puzzles/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
  const bucket = adminStorage.bucket();
  const fileRef = bucket.file(filename);

  await fileRef.save(buffer, { metadata: { contentType: file.type } });
  await fileRef.makePublic();

  const url = `https://storage.googleapis.com/${bucket.name}/${filename}`;
  return NextResponse.json({ url });
}
