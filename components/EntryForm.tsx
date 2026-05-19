"use client";

import { useState, useRef } from "react";
import { saveEntry } from "@/lib/db";
import type { Entry, Attachment } from "@/types/entry";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ACCEPT = [
  "image/*", "audio/*", "video/*",
  ".pdf", ".doc", ".docx", ".txt",
  ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".php", ".rb", ".java",
  ".c", ".cpp", ".cs", ".swift", ".kt", ".dart",
  ".html", ".htm", ".css", ".json", ".md",
  ".sh", ".yaml", ".yml", ".toml", ".sql",
  ".vue", ".svelte", ".r", ".m",
].join(",");

function fileCategory(a: Attachment): "image" | "audio" | "video" | "pdf" | "code" | "other" {
  if (a.mimeType.startsWith("image/")) return "image";
  if (a.mimeType.startsWith("audio/")) return "audio";
  if (a.mimeType.startsWith("video/")) return "video";
  if (a.mimeType === "application/pdf") return "pdf";
  const ext = a.name.split(".").pop()?.toLowerCase() ?? "";
  const codeExts = new Set(["js","ts","jsx","tsx","mjs","cjs","py","rs","go","php","rb","java","c","cpp","cs","swift","kt","dart","html","htm","css","json","md","sh","yaml","yml","toml","sql","vue","svelte","r","m"]);
  return codeExts.has(ext) ? "code" : "other";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  onSaved: (entry: Entry) => void;
}

export default function EntryForm({ onSaved }: Props) {
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addTag(value: string) {
    const tag = value.trim().toLowerCase().replace(/^#/, "");
    if (tag && !tags.includes(tag)) setTags((prev) => [...prev, tag]);
    setTagInput("");
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (tagInput.trim()) addTag(tagInput);
    }
    if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  async function handleFiles(fileList: FileList) {
    const next: Attachment[] = [];
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`"${file.name}" ist zu groß (max. 10 MB).`);
        continue;
      }
      const data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      next.push({ name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data });
    }
    setAttachments((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!content.trim() && attachments.length === 0) return;
    if (saving) return;
    setSaving(true);
    try {
      const finalTags = tagInput.trim()
        ? [...tags, tagInput.trim().toLowerCase().replace(/^#/, "")]
        : tags;
      const entry = await saveEntry(content.trim(), finalTags, attachments.length ? attachments : undefined);
      onSaved(entry);
      setContent("");
      setTags([]);
      setTagInput("");
      setAttachments([]);
      textareaRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit();
  }

  const hasContent = content.trim().length > 0 || attachments.length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl transition-all duration-200"
      style={{
        background: "var(--bg-card)",
        boxShadow: focused ? "var(--shadow-form)" : "var(--shadow-card)",
      }}
    >
      <div className="px-5 pt-5">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Was hast du heute gelernt?"
          rows={4}
          autoFocus
          className="journal-input w-full resize-none bg-transparent font-sans text-base leading-relaxed outline-none"
          style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
        />
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-5 pb-2">
          {attachments.map((att, i) => {
            const cat = fileCategory(att);
            return cat === "image" ? (
              <div key={i} className="group relative">
                <img
                  src={att.data}
                  alt={att.name}
                  className="h-16 w-16 rounded-xl object-cover"
                  style={{ border: "1px solid var(--border)" }}
                />
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full font-sans text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: "var(--fg)", color: "var(--bg)" }}
                >
                  ×
                </button>
              </div>
            ) : (
              <div
                key={i}
                className="group flex items-center gap-2 rounded-xl px-3 py-1.5"
                style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
              >
                <span className="font-sans text-xs" style={{ color: "var(--fg)" }}>{att.name}</span>
                <span className="font-sans text-[10px]" style={{ color: "var(--fg-muted)" }}>{formatSize(att.size)}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  className="opacity-40 transition-opacity hover:opacity-80"
                  style={{ color: "var(--fg)" }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-1">
        {/* Upload button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn-3d flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ color: "var(--fg-muted)" }}
          title="Datei anhängen"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="sr-only"
          tabIndex={-1}
        />

        {/* Tags */}
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
            className="group flex items-center gap-1 rounded-full px-2.5 py-0.5 font-sans text-xs transition-opacity"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            #{tag}
            <span className="opacity-40 group-hover:opacity-80">×</span>
          </button>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          onBlur={() => tagInput.trim() && addTag(tagInput)}
          placeholder={tags.length === 0 ? "Tags..." : ""}
          className="journal-input min-w-[60px] flex-1 bg-transparent font-sans text-xs outline-none"
          style={{ color: "var(--fg-muted)" }}
        />

        <div className="ml-auto flex items-center gap-3">
          <span
            className="hidden font-sans text-[11px] sm:block"
            style={{ color: "var(--fg-muted)", opacity: 0.5 }}
          >
            ⌘↵
          </span>
          <button
            type="submit"
            disabled={!hasContent || saving}
            className="rounded-full px-4 py-1.5 font-sans text-sm font-medium transition-all"
            style={{
              background: hasContent ? "var(--fg)" : "var(--border)",
              color: hasContent ? "var(--bg)" : "var(--fg-muted)",
              opacity: saving ? 0.65 : 1,
              cursor: hasContent ? "pointer" : "default",
            }}
          >
            {saving ? "…" : "Speichern"}
          </button>
        </div>
      </div>
    </form>
  );
}
