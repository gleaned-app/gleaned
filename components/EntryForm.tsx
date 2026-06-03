"use client";

import { useState, useRef, useEffect } from "react";
import { saveEntry, getAllTags } from "@/lib/db";
import type { Entry, Attachment, EntryType } from "@/types/entry";
import { useT } from "@/lib/i18n";
import type { Translations } from "@/lib/i18n";
import { useSettings } from "@/lib/settings-context";

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

// Static — defined outside component to avoid re-creation on every render.
const ENTRY_TYPES: { value: EntryType; labelKey: keyof Translations }[] = [
  { value: "insight",     labelKey: "typeInsight"     },
  { value: "technique",   labelKey: "typeTechnique"   },
  { value: "framework",   labelKey: "typeFramework"   },
  { value: "fact",        labelKey: "typeFact"        },
  { value: "observation", labelKey: "typeObservation" },
];

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
  const { settings } = useSettings();
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [focused, setFocused] = useState(false);
  const [existingTags, setExistingTags] = useState<string[]>([]);
  // Context panel state
  const [contextOpen, setContextOpen] = useState(true);
  const [entryType, setEntryType] = useState<string | undefined>(undefined);
  const [source, setSource] = useState("");
  const [context, setContext] = useState("");
  const [stake, setStake] = useState("");
  const [gap, setGap] = useState("");

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
        (tag) => tag.startsWith(tagInput.trim().toLowerCase().replace(/^#/, "")) && !tags.includes(tag)
      ).slice(0, 5)
    : [];

  // True when any context field carries data — used to boost toggle visibility.
  const hasContextData = !!entryType || !!context || source.trim() !== "" || stake.trim() !== "" || gap.trim() !== "";

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
      next.push({ id: Math.random().toString(36).slice(2, 10), name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data });
    }
    setAttachments((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!content.trim() && attachments.length === 0) return;
    if (saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      const finalTags = tagInput.trim()
        ? [...tags, tagInput.trim().toLowerCase().replace(/^#/, "")]
        : tags;
      // Convert empty strings to undefined so absent fields are not stored.
      const entry = await saveEntry({
        content: content.trim(),
        tags: finalTags,
        attachments: attachments.length ? attachments : undefined,
        entryType,
        context:   context         || undefined,
        source:    source.trim()   || undefined,
        stake:     stake.trim()    || undefined,
        gap:       gap.trim()      || undefined,
      });
      onSaved(entry);
      setContent("");
      setTags([]);
      setTagInput("");
      setAttachments([]);
      setEntryType(undefined);
      setContext("");
      setSource("");
      setStake("");
      setGap("");
      // Keep context panel open if user had data — feels less jarring.
      if (!hasContextData) setContextOpen(false);
      textareaRef.current?.focus();
    } catch {
      setSaveError(true);
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
      {/* Writing surface */}
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
            minHeight: "clamp(5rem, 16dvh, 11rem)",
            padding: "0",
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent, transparent calc(1.625em - 1px), var(--border-rule) calc(1.625em - 1px), var(--border-rule) 1.625em)",
            backgroundAttachment: "local",
            backgroundPositionY: "0px",
          }}
        />
      </div>

      {/* Context toggle — horizontal rule with centered label */}
      <button
        type="button"
        onClick={() => setContextOpen((o) => !o)}
        className="flex w-full items-center gap-2 py-2.5 font-sans text-xs"
        style={{
          color: "var(--fg-muted)",
          opacity: hasContextData ? 1 : 0.65,
          transition: "opacity 150ms ease",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span aria-hidden style={{ flex: 1, height: "1px", background: "var(--border)" }} />
        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", userSelect: "none" }}>
          <span
            style={{
              display: "inline-block",
              transform: contextOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms cubic-bezier(0.16, 1, 0.3, 1)",
              lineHeight: 1,
            }}
          >
            ▾
          </span>
          {t.contextToggle}
          {hasContextData && (
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>·</span>
          )}
        </span>
        <span aria-hidden style={{ flex: 1, height: "1px", background: "var(--border)" }} />
      </button>

      {/* Context panel — CSS grid height animation, no JS measurement */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: contextOpen ? "1fr" : "0fr",
          transition: "grid-template-rows 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div
            style={{
              opacity: contextOpen ? 1 : 0,
              transition: "opacity 180ms ease",
              paddingBottom: "0.75rem",
            }}
          >
            {/* Entry type chips — built-ins + user-defined custom types */}
            <div className="flex flex-wrap gap-1.5 pb-3">
              {[
                ...ENTRY_TYPES.map(({ value, labelKey }) => ({ value, label: t[labelKey] as string })),
                ...settings.customEntryTypes.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })),
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  data-active={entryType === value ? "true" : undefined}
                  onClick={() => setEntryType((prev) => prev === value ? undefined : value)}
                  className="btn-3d-subtle rounded-full px-3 font-sans text-xs"
                  style={{
                    color: entryType === value ? "var(--accent)" : "var(--fg-muted)",
                    minHeight: "2.2rem",
                    transition: "color 120ms ease",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Source */}
            <div style={{ borderBottom: "1.5px solid var(--border-rule)" }}>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={t.sourcePlaceholder}
                className="journal-input w-full bg-transparent py-2 font-sans text-sm outline-none"
                style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
              />
            </div>

            {/* Lernort — compact chip strip, only shown when chips are configured */}
            {(settings.contextSources ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 py-1.5" style={{ borderBottom: "1.5px solid var(--border-rule)" }}>
                {(settings.contextSources ?? []).map((ctx) => (
                  <button
                    key={ctx}
                    type="button"
                    onClick={() => setContext((prev) => prev === ctx ? "" : ctx)}
                    className="btn-3d-subtle rounded-full font-sans"
                    style={{
                      fontSize: "11px",
                      padding: "0.2rem 0.65rem",
                      color: context === ctx ? "var(--accent)" : "var(--fg-muted)",
                      transition: "color 120ms ease",
                    }}
                  >
                    {context === ctx ? "▪ " : ""}{ctx}
                  </button>
                ))}
              </div>
            )}

            {/* Stake */}
            <div style={{ borderBottom: "1.5px solid var(--border-rule)" }}>
              <input
                type="text"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder={t.stakePlaceholder}
                className="journal-input w-full bg-transparent py-2 font-sans text-sm outline-none"
                style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
              />
            </div>

            {/* Gap — dashed amber border signals open/uncertain vs. the solid borders above */}
            <div style={{ borderBottom: "1px dashed color-mix(in oklch, var(--due-today) 55%, transparent)" }}>
              <textarea
                rows={2}
                value={gap}
                onChange={(e) => setGap(e.target.value)}
                placeholder={t.gapPlaceholder}
                className="journal-input w-full resize-none bg-transparent py-2 font-sans text-sm leading-relaxed outline-none"
                style={{ color: "var(--fg)", caretColor: "var(--due-today)" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2">
          {attachments.map((att, i) => {
            const cat = fileCategory(att);
            return cat === "image" ? (
              <div key={i} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 pb-3 pt-2">
        {/* Upload button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn-3d flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl font-sans text-xl font-light leading-none"
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
            onClick={() => setTags((prev) => prev.filter((tg) => tg !== tag))}
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
              className="absolute bottom-full left-0 z-20 mb-1 flex flex-col overflow-hidden rounded-xl py-1"
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
          {saveError && (
            <span className="font-sans text-[11px]" style={{ color: "var(--due-overdue)" }}>
              {t.genericError}
            </span>
          )}
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
