"use client";

export const dynamic = "force-dynamic";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { storage } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const TEMPLATES = [
  { id: "rebus", label: "Rebus", desc: "Show image → players type answer in letter blocks" },
  { id: "text_quiz", label: "Text Quiz", desc: "Show text question → players type answer" },
  { id: "media_clip", label: "Media Clip", desc: "Play audio/video → players guess the answer" },
];

const EMPTY_QUESTION = { mediaUrl: "", mediaType: "image", questionText: "", answer: "", hint: "", timeLimit: 30 };

export default function CreateGamePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("rebus");
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const [questions, setQuestions] = useState([{ ...EMPTY_QUESTION }]);
  const [uploading, setUploading] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRefs = useRef([]);

  const updateQuestion = (idx, field, value) => {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));
  };

  const addQuestion = () => setQuestions((qs) => [...qs, { ...EMPTY_QUESTION }]);

  const removeQuestion = (idx) =>
    setQuestions((qs) => qs.filter((_, i) => i !== idx));

  const uploadMedia = (idx, file) => {
    const type = file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : "image";
    const filename = `puzzles/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
    const storageRef = ref(storage, filename);
    const task = uploadBytesResumable(storageRef, file);

    setUploading((u) => ({ ...u, [idx]: 0 }));
    task.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setUploading((u) => ({ ...u, [idx]: pct }));
      },
      () => setUploading((u) => ({ ...u, [idx]: false })),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        updateQuestion(idx, "mediaUrl", url);
        updateQuestion(idx, "mediaType", type);
        setUploading((u) => ({ ...u, [idx]: false }));
      }
    );
  };

  const handleSave = async () => {
    if (!title.trim()) return setError("Game title is required.");
    if (questions.some((q) => !q.answer.trim())) return setError("Every question needs an answer.");
    setSaving(true);
    setError("");
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, template, questions, timePerQuestion }),
    });
    const data = await res.json();
    if (data.id) router.push(`/admin/host/${data.id}`);
    else { setError(data.error || "Failed to save."); setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Create New Game</h1>
          <button onClick={() => router.push("/admin")} className="text-sm text-slate-500 hover:text-slate-800">
            ← Back
          </button>
        </div>

        {/* Game Settings */}
        <div className="rounded-xl bg-white p-5 shadow space-y-4">
          <h2 className="font-semibold text-lg">Game Settings</h2>

          <div>
            <label className="block text-sm font-medium mb-1">Game Title</label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="e.g. Rebus Challenge Round 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Game Template</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`rounded-xl border-2 p-3 text-left transition ${
                    template === t.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-300"
                  }`}
                >
                  <div className="font-semibold text-sm">{t.label}</div>
                  <div className="text-xs text-slate-500 mt-1">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Default Time per Question (seconds)</label>
            <input
              type="number"
              min={10}
              max={120}
              className="w-32 rounded-lg border px-3 py-2 text-sm"
              value={timePerQuestion}
              onChange={(e) => setTimePerQuestion(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={idx} className="rounded-xl bg-white p-5 shadow space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Question {idx + 1}</span>
                {questions.length > 1 && (
                  <button
                    onClick={() => removeQuestion(idx)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Media upload */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  {template === "media_clip" ? "Audio / Video File" : "Image (optional)"}
                </label>
                <input
                  ref={(el) => (fileRefs.current[idx] = el)}
                  type="file"
                  accept={template === "media_clip" ? "audio/*,video/*" : "image/*"}
                  className="text-sm"
                  onChange={(e) => e.target.files?.[0] && uploadMedia(idx, e.target.files[0])}
                />
                {uploading[idx] !== false && uploading[idx] !== undefined && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${uploading[idx]}%` }} />
                    </div>
                    <p className="text-xs text-indigo-500">{uploading[idx]}% uploaded</p>
                  </div>
                )}
                {q.mediaUrl && q.mediaType === "image" && (
                  <img src={q.mediaUrl} alt="preview" className="mt-2 max-h-36 rounded-lg border" />
                )}
                {q.mediaUrl && q.mediaType === "audio" && (
                  <audio src={q.mediaUrl} controls className="mt-2 w-full" />
                )}
                {q.mediaUrl && q.mediaType === "video" && (
                  <video src={q.mediaUrl} controls className="mt-2 w-full max-h-40 rounded-lg" />
                )}
              </div>

              {/* Question text */}
              {template !== "rebus" && (
                <div>
                  <label className="block text-sm font-medium mb-1">Question Text</label>
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="What is shown here?"
                    value={q.questionText}
                    onChange={(e) => updateQuestion(idx, "questionText", e.target.value)}
                  />
                </div>
              )}

              {/* Answer */}
              <div>
                <label className="block text-sm font-medium mb-1">Answer</label>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="e.g. black horse"
                  value={q.answer}
                  onChange={(e) => updateQuestion(idx, "answer", e.target.value)}
                />
              </div>

              {/* Hint */}
              <div>
                <label className="block text-sm font-medium mb-1">Hint (optional — shown if admin reveals)</label>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="e.g. A dark-coloured animal"
                  value={q.hint}
                  onChange={(e) => updateQuestion(idx, "hint", e.target.value)}
                />
              </div>

              {/* Per-question timer override */}
              <div>
                <label className="block text-sm font-medium mb-1">Time Limit (seconds)</label>
                <input
                  type="number"
                  min={10}
                  max={120}
                  className="w-24 rounded-lg border px-3 py-2 text-sm"
                  value={q.timeLimit}
                  onChange={(e) => updateQuestion(idx, "timeLimit", Number(e.target.value))}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addQuestion}
          className="w-full rounded-xl border-2 border-dashed border-indigo-300 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
        >
          + Add Question
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : `Save Game & Get Room Code (${questions.length} questions)`}
        </button>
      </div>
    </div>
  );
}
