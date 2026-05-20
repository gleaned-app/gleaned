"use client";

import { useState, useRef, useEffect } from "react";
import { saveEntry, getAllTags } from "@/lib/db";
import type { Entry, Attachment } from "@/types/entry";
import { useT } from "@/lib/i18n";

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
  const t = useT();
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAllTags().then((m) => setExistingTags([...m.keys()]));
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [content]);

  const suggestions = tagInput.trim()
    ? existingTags.filter(
        (t) => t.startsWith(tagInput.trim().toLowerCase().replace(/^#/, "")) && !tags.includes(t)
      ).slice(0, 5)
    : [];

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
        alert(t.fileTooLarge(file.name));
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

  function handleLineClick(e: React.MouseEvent<HTMLTextAreaElement>) {
    const el = textareaRef.current;
    if (!el) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    const rect = el.getBoundingClientRect();
    const relY = e.clientY - rect.top + el.scrollTop;
    const targetLine = Math.floor(relY / lineHeight);
    const lines = el.value.split("\n");
    if (targetLine >= lines.length) {
      const newVal = el.value + "\n".repeat(targetLine - lines.length + 1);
      setContent(newVal);
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.setSelectionRange(newVal.length, newVal.length);
      });
    }
  }

  const hasContent = content.trim().length > 0 || attachments.length > 0;

  return (
    <form onSubmit={handleSubmit} className="transition-all duration-200">
      {/* Writing surface — blends into page, lines are the only visual structure */}
      <div
        className="rounded-xl px-0 pt-1 pb-0"
        style={{
          borderBottom: `1px solid ${focused ? "var(--accent-soft)" : "var(--border)"}`,
          transition: "border-color 200ms ease",
        }}
      >
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onClick={handleLineClick}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t.entryPlaceholder}
          autoFocus
          className="journal-input w-full resize-none bg-transparent text-base leading-relaxed outline-none"
          style={{
            color: "var(--fg)",
            caretColor: "var(--accent)",
            fontFamily: "var(--font-body)",
            minHeight: "clamp(10rem, 40vh, 28rem)",
            padding: "0",
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent, transparent calc(1.625em - 1px), var(--border) calc(1.625em - 1px), var(--border) 1.625em)",
            backgroundAttachment: "local",
            backgroundPositionY: "0px",
          }}
        />
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2">
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

      <div className="flex flex-wrap items-center gap-2 pb-3 pt-2">
        {/* Upload button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn-3d flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl font-sans text-xl font-light leading-none"
          style={{ color: "var(--accent)" }}
          title={t.attachFile}
        >
          +
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
        <div className="relative min-w-[60px] flex-1">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={() => setTimeout(() => tagInput.trim() && addTag(tagInput), 150)}
            placeholder={tags.length === 0 ? t.tagsPlaceholder : ""}
            className="journal-input w-full bg-transparent font-sans text-xs outline-none"
            style={{ color: "var(--fg-muted)" }}
          />
          {suggestions.length > 0 && (
            <div
              className="absolute bottom-full left-0 mb-1 z-20 flex flex-col overflow-hidden rounded-xl py-1"
              style={{
                background: "var(--bg-card)",
                boxShadow: "var(--shadow-form)",
                border: "1px solid var(--border)",
                minWidth: "120px",
              }}
            >
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
                  className="px-3 py-1.5 text-left font-sans text-xs transition-colors hover:bg-[var(--accent-soft)]"
                  style={{ color: "var(--accent)" }}
                >
                  #{s}
                </button>
              ))}
            </div>
          )}
        </div>

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
            {saving ? "…" : t.save}
          </button>
        </div>
      </div>
    </form>
  );
}
