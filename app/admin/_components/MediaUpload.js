"use client";

import { useRef, useState } from "react";
import { storage } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

// accept: "image/*" | "audio/*,video/*" | "image/*,video/*,audio/*"
export default function MediaUpload({ accept = "image/*,image/gif", value, mediaType, onUploaded, onClear, label = "Media" }) {
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const [dragging, setDragging] = useState(false);

  const upload = (file) => {
    if (!file) return;
    const type = file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : "image";
    const filename = `puzzles/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
    const storageRef = ref(storage, filename);
    const task = uploadBytesResumable(storageRef, file);
    setProgress(0);
    task.on(
      "state_changed",
      (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      () => setProgress(null),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        onUploaded(url, type);
        setProgress(null);
      }
    );
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">{label}</label>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !value && inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition cursor-pointer min-h-[90px] px-4 py-4 text-center
          ${dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"}
          ${value ? "cursor-default" : ""}`}
      >
        {!value && progress === null && (
          <>
            <span className="text-2xl mb-1">📎</span>
            <p className="text-sm text-slate-500">Drag & drop or <span className="text-indigo-600 font-medium underline">click to browse</span></p>
            <p className="text-xs text-slate-400 mt-0.5">Images, GIFs, audio, video</p>
          </>
        )}

        {progress !== null && (
          <div className="w-full space-y-2">
            <div className="h-2 w-full rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-indigo-600">{progress}% uploading...</p>
          </div>
        )}

        {value && mediaType === "image" && (
          <img src={value} alt="preview" className="max-h-40 rounded-lg object-contain mx-auto" />
        )}
        {value && mediaType === "audio" && (
          <audio src={value} controls className="w-full" />
        )}
        {value && mediaType === "video" && (
          <video src={value} controls className="w-full max-h-40 rounded-lg" />
        )}
      </div>

      <div className="flex gap-2">
        {value && (
          <button type="button" onClick={onClear}
            className="rounded-lg bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100">
            Remove
          </button>
        )}
        <button type="button" onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200">
          {value ? "Replace" : "Browse"}
        </button>
      </div>

      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </div>
  );
}
