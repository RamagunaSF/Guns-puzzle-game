"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import MediaUpload from "@/app/admin/_components/MediaUpload";

const TEMPLATES = [
  { id: "rebus", label: "Rebus", icon: "🧩", desc: "Show image → players type answer in letter blocks" },
  { id: "text_quiz", label: "Text Quiz", icon: "📝", desc: "Show text question → players type answer" },
  { id: "media_clip", label: "Media Clip", icon: "🎵", desc: "Play audio/video → players guess the answer" },
  { id: "colour_flash", label: "Colour Flash", icon: "🎨", desc: "Players race to tap the correct colour box" },
];

const TIME_OPTIONS = [
  { value: 0, label: "No time limit" },
  { value: 15, label: "15 s" },
  { value: 20, label: "20 s" },
  { value: 30, label: "30 s" },
  { value: 45, label: "45 s" },
  { value: 60, label: "60 s" },
  { value: 90, label: "90 s" },
  { value: 120, label: "120 s" },
];

const COLOURS = [
  { key: "red", label: "Red", bg: "bg-red-500", ring: "ring-red-400" },
  { key: "green", label: "Green", bg: "bg-green-500", ring: "ring-green-400" },
  { key: "yellow", label: "Yellow", bg: "bg-yellow-400", ring: "ring-yellow-400" },
  { key: "blue", label: "Blue", bg: "bg-blue-500", ring: "ring-blue-400" },
];

export default function EditGamePage() {
  const { id } = useParams();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("rebus");
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const [questions, setQuestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/games/${id}`)
      .then((r) => r.json())
      .then((g) => {
        setTitle(g.title || "");
        setTemplate(g.template || "rebus");
        setTimePerQuestion(g.timePerQuestion || 30);
        // Backfill missing fields on loaded questions
        setQuestions((g.questions || []).map((q) => ({
          scoringEnabled: true,
          multiAttempt: false,
          ...q,
        })));
        setLoaded(true);
      });
  }, [id]);

  const updateQ = (idx, field, value) =>
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));

  const handleDefaultTimeChange = (val) => {
    setTimePerQuestion(val);
    setQuestions((qs) => qs.map((q) => ({ ...q, timeLimit: val })));
  };

  const addQuestion = () => {
    const base = { scoringEnabled: true, multiAttempt: false, timeLimit: timePerQuestion };
    if (template === "colour_flash") {
      setQuestions((qs) => [...qs, { ...base, questionMediaUrl: "", questionMediaType: "image", questionText: "", answerMediaUrl: "", answerMediaType: "image", answerText: "", correctColour: "red" }]);
    } else {
      setQuestions((qs) => [...qs, { ...base, mediaUrl: "", mediaType: "image", questionText: "", answer: "", hint: "" }]);
    }
  };

  const removeQuestion = (idx) => setQuestions((qs) => qs.filter((_, i) => i !== idx));

  const handleSave = async (andHost = false) => {
    if (!title.trim()) return setError("Game title is required.");
    if (template === "colour_flash") {
      if (questions.some((q) => !q.correctColour)) return setError("Every question needs a correct colour.");
    } else {
      if (questions.some((q) => !q.answer?.trim())) return setError("Every question needs an answer.");
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/games", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title, template, questions, timePerQuestion }),
    });
    const data = await res.json();
    if (data.ok) {
      if (andHost) router.push(`/admin/host/${id}`);
      else router.push("/admin");
    } else {
      setError(data.error || "Failed to save.");
      setSaving(false);
    }
  };

  if (!loaded) return <div className="p-8 text-slate-500">Loading game...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Edit Game</h1>
          <button onClick={() => router.push("/admin")} className="text-sm text-slate-500 hover:text-slate-800">← Back</button>
        </div>

        {/* Game Settings */}
        <div className="rounded-xl bg-white p-5 shadow space-y-4">
          <h2 className="font-semibold text-lg">Game Settings</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Game Title</label>
            <input className="w-full rounded-lg border px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Game Template</label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => setTemplate(t.id)}
                  className={`rounded-xl border-2 p-3 text-left transition ${template === t.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-300"}`}>
                  <div className="text-xl mb-1">{t.icon}</div>
                  <div className="font-semibold text-sm">{t.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Default Time per Question</label>
            <select className="w-44 rounded-lg border px-3 py-2 text-sm" value={timePerQuestion}
              onChange={(e) => handleDefaultTimeChange(Number(e.target.value))}>
              {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1">Applied to all questions — override per question below</p>
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={idx} className="rounded-xl bg-white p-5 shadow space-y-5">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Question {idx + 1}</span>
                {questions.length > 1 && (
                  <button onClick={() => removeQuestion(idx)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>

              {/* ── COLOUR FLASH fields ─────────────────────────────────── */}
              {template === "colour_flash" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Question</p>
                      <MediaUpload label="Image / GIF / Video"
                        accept="image/*,image/gif,video/*,video/quicktime"
                        value={q.questionMediaUrl}
                        mediaType={q.questionMediaType}
                        onUploaded={(url, type) => { updateQ(idx, "questionMediaUrl", url); updateQ(idx, "questionMediaType", type); }}
                        onClear={() => { updateQ(idx, "questionMediaUrl", ""); updateQ(idx, "questionMediaType", "image"); }}
                      />
                      <div>
                        <label className="block text-sm font-medium mb-1">Or enter text</label>
                        <textarea rows={3} className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
                          placeholder="Type your question here..."
                          value={q.questionText || ""} onChange={(e) => updateQ(idx, "questionText", e.target.value)} />
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Answer</p>
                      <MediaUpload label="Image / GIF / Video"
                        accept="image/*,image/gif,video/*,video/quicktime"
                        value={q.answerMediaUrl}
                        mediaType={q.answerMediaType}
                        onUploaded={(url, type) => { updateQ(idx, "answerMediaUrl", url); updateQ(idx, "answerMediaType", type); }}
                        onClear={() => { updateQ(idx, "answerMediaUrl", ""); updateQ(idx, "answerMediaType", "image"); }}
                      />
                      <div>
                        <label className="block text-sm font-medium mb-1">Or enter text</label>
                        <textarea rows={3} className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
                          placeholder="Reveal text..."
                          value={q.answerText || ""} onChange={(e) => updateQ(idx, "answerText", e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Correct Colour</label>
                    <div className="flex gap-3">
                      {COLOURS.map((c) => (
                        <button key={c.key} type="button" onClick={() => updateQ(idx, "correctColour", c.key)}
                          className={`h-12 w-12 rounded-xl ${c.bg} transition ring-offset-2 ${q.correctColour === c.key ? `ring-4 ${c.ring} scale-110` : "opacity-60 hover:opacity-90"}`}
                          title={c.label} />
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Selected: <span className="font-semibold capitalize">{q.correctColour}</span></p>
                  </div>
                </>
              )}

              {/* ── REBUS / TEXT QUIZ / MEDIA CLIP fields ──────────────── */}
              {template !== "colour_flash" && (
                <>
                  <MediaUpload
                    label={template === "media_clip" ? "Audio / Video" : "Image / GIF"}
                    accept={template === "media_clip" ? "audio/*,video/*" : "image/*,image/gif"}
                    value={q.mediaUrl}
                    mediaType={q.mediaType}
                    onUploaded={(url, type) => { updateQ(idx, "mediaUrl", url); updateQ(idx, "mediaType", type); }}
                    onClear={() => { updateQ(idx, "mediaUrl", ""); updateQ(idx, "mediaType", "image"); }}
                  />
                  {template !== "rebus" && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Question Text</label>
                      <textarea rows={2} className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
                        placeholder="What is shown here?"
                        value={q.questionText || ""} onChange={(e) => updateQ(idx, "questionText", e.target.value)} />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium mb-1">Answer</label>
                    <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="e.g. black horse"
                      value={q.answer || ""} onChange={(e) => updateQ(idx, "answer", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Hint (optional)</label>
                    <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="e.g. A dark-coloured animal"
                      value={q.hint || ""} onChange={(e) => updateQ(idx, "hint", e.target.value)} />
                  </div>
                </>
              )}

              {/* ── Per-question settings (all templates) ──────────────── */}
              <div className="border-t pt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Time Limit</label>
                  <select className="w-full rounded-lg border px-2 py-1.5 text-sm" value={q.timeLimit}
                    onChange={(e) => updateQ(idx, "timeLimit", Number(e.target.value))}>
                    {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Scoring</label>
                  <div className="flex gap-2">
                    {[true, false].map((v) => (
                      <button key={String(v)} type="button" onClick={() => updateQ(idx, "scoringEnabled", v)}
                        className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition ${q.scoringEnabled === v ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                        {v ? "On" : "Off"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Attempts</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => updateQ(idx, "multiAttempt", false)}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition ${!q.multiAttempt ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                      Locked
                    </button>
                    <button type="button" onClick={() => updateQ(idx, "multiAttempt", true)}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition ${q.multiAttempt ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                      Multi
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={addQuestion}
          className="w-full rounded-xl border-2 border-dashed border-indigo-300 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">
          + Add Question
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button onClick={() => handleSave(false)} disabled={saving}
            className="flex-1 rounded-xl border-2 border-indigo-600 py-3 font-bold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button onClick={() => handleSave(true)} disabled={saving}
            className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "Saving..." : "Save & Host Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
