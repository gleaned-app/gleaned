"use client";

import { useState, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { Entry, EntryType } from "@/types/entry";
import { updateEntry, deleteEntry } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { useSettings, locale } from "@/lib/settings-context";
import { parseSource } from "@/lib/entry-utils";
import type { Translations } from "@/lib/i18n";
import { AttachmentView } from "./AttachmentView";

marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    html: () => "",
    link({ href, title, text }: { href: string; title?: string | null; text: string }) {
      const t = title ? ` title="${title}"` : "";
      return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

const ENTRY_TYPES: { value: EntryType; labelKey: keyof Translations }[] = [
  { value: "insight",     labelKey: "typeInsight"     },
  { value: "technique",   labelKey: "typeTechnique"   },
  { value: "framework",   labelKey: "typeFramework"   },
  { value: "fact",        labelKey: "typeFact"        },
  { value: "observation", labelKey: "typeObservation" },
];

// Renders a source string with smart format detection (URL, DOI, ISBN, text).
function SourceValue({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);
  if (!parsed.label) return null;

  if (parsed.href) {
    return (
      <a
        href={parsed.href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-sans text-xs transition-opacity hover:opacity-70"
        style={{
          color: "var(--accent)",
          textDecoration: "none",
          wordBreak: "break-all",
        }}
      >
        {parsed.label}
        {/* External link indicator */}
        <svg
          width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ display: "inline", marginLeft: "3px", verticalAlign: "middle", opacity: 0.6 }}
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
    );
  }

  return (
    <span className="font-sans text-xs" style={{ color: "var(--fg-muted)" }}>
      {parsed.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  entry: Entry;
  onDelete?: (id: string) => void;
  onUpdate?: (entry: Entry) => void;
  onTagClick?: (tag: string) => void;
  flat?: boolean;
}

export default function EntryCard({ entry, onDelete, onUpdate, onTagClick, flat }: Props) {
  const t = useT();
  const { settings } = useSettings();
  const loc = locale(settings);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(entry.content);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(entry.tags);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  // Edit mode context panel
  const [contextOpen, setContextOpen] = useState(false);
  const [editType, setEditType] = useState<string | undefined>(undefined);
  const [editContext, setEditContext] = useState("");
  const [editSource, setEditSource] = useState("");
  const [editStake, setEditStake] = useState("");
  const [editGap, setEditGap] = useState("");

  const time = new Date(entry.createdAt).toLocaleTimeString(loc, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const hasContextData = !!entry.entryType || !!entry.context || !!entry.source || !!entry.stake || !!entry.gap;

  function handleEditStart() {
    setContent(entry.content);
    setTags(entry.tags);
    setTagInput("");
    setEditType(entry.entryType);
    setEditContext(entry.context ?? "");
    setEditSource(entry.source ?? "");
    setEditStake(entry.stake ?? "");
    setEditGap(entry.gap ?? "");
    // Auto-open context panel if the entry already has context data
    setContextOpen(hasContextData);
    setEditing(true);
  }

  function handleCancel() {
    setContent(entry.content);
    setTags(entry.tags);
    setTagInput("");
    setEditing(false);
  }

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

  async function handleSave() {
    if (!content.trim() || saving) return;
    setSaving(true);
    try {
      const finalTags = tagInput.trim()
        ? [...tags, tagInput.trim().toLowerCase().replace(/^#/, "")]
        : tags;
      const updated = await updateEntry(entry, {
        content: content.trim(),
        tags: finalTags,
        entryType: editType,
        context:   editContext     || undefined,
        source: editSource.trim()  || undefined,
        stake:  editStake.trim()   || undefined,
        gap:    editGap.trim()     || undefined,
      });
      onUpdate?.(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await deleteEntry(entry._id);
    onDelete?.(entry._id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  }

  const mdHtml = useMemo(
    () => entry.content ? DOMPurify.sanitize(marked.parse(entry.content) as string, { ADD_ATTR: ["target"] }) : "",
    [entry.content],
  );

  const cardStyle = flat
    ? { borderLeft: "2px solid var(--accent-soft)", paddingLeft: "1.25rem" }
    : {
        background: "var(--bg-card)",
        boxShadow: "var(--shadow-card)",
        borderLeft: "3px solid var(--accent)",
      };
  const cardClass = flat ? "py-1" : "card-lift rounded-xl px-5 py-4";

  // ── Edit mode ───────────────────────────────────────────────────────────────

  if (editing) {
    const editHasContext = !!editType || !!editContext || editSource.trim() !== "" || editStake.trim() !== "" || editGap.trim() !== "";
    return (
      <div className={cardClass} style={cardStyle}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          rows={Math.max(3, content.split("\n").length + 1)}
          className="journal-input w-full resize-none bg-transparent text-base leading-relaxed outline-none"
          style={{ color: "var(--fg)", caretColor: "var(--accent)", fontFamily: "var(--font-body)" }}
        />

        {/* Context toggle */}
        <button
          type="button"
          onClick={() => setContextOpen((o) => !o)}
          className="flex w-full items-center gap-2 py-2 font-sans text-xs"
          style={{
            color: "var(--fg-muted)",
            opacity: editHasContext ? 1 : 0.6,
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
            {editHasContext && <span style={{ color: "var(--accent)", fontWeight: 600 }}>·</span>}
          </span>
          <span aria-hidden style={{ flex: 1, height: "1px", background: "var(--border)" }} />
        </button>

        {/* Context panel */}
        <div
          style={{
            display: "grid",
            gridTemplateRows: contextOpen ? "1fr" : "0fr",
            transition: "grid-template-rows 220ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <div style={{ opacity: contextOpen ? 1 : 0, transition: "opacity 180ms ease", paddingBottom: "0.5rem" }}>
              {/* Type chips — built-ins + user-defined custom types */}
              <div className="flex flex-wrap gap-1.5 pb-3">
                {[
                  ...ENTRY_TYPES.map(({ value, labelKey }) => ({ value, label: t[labelKey] as string })),
                  ...settings.customEntryTypes.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })),
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    data-active={editType === value ? "true" : undefined}
                    onClick={() => setEditType((prev) => prev === value ? undefined : value)}
                    className="btn-3d-subtle rounded-full px-3 font-sans text-xs"
                    style={{
                      color: editType === value ? "var(--accent)" : "var(--fg-muted)",
                      minHeight: "2.2rem",
                      transition: "color 120ms ease",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Source */}
              <div style={{ borderBottom: "1px solid var(--border)" }}>
                <input
                  type="text"
                  value={editSource}
                  onChange={(e) => setEditSource(e.target.value)}
                  placeholder={t.sourcePlaceholder}
                  className="journal-input w-full bg-transparent py-2 font-sans text-sm outline-none"
                  style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
                />
              </div>
              {/* Lernort */}
              {(settings.contextSources ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1 py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
                  {(settings.contextSources ?? []).map((ctx) => (
                    <button
                      key={ctx}
                      type="button"
                      onClick={() => setEditContext((prev) => prev === ctx ? "" : ctx)}
                      className="btn-3d-subtle rounded-full font-sans"
                      style={{
                        fontSize: "11px",
                        padding: "0.2rem 0.65rem",
                        color: editContext === ctx ? "var(--accent)" : "var(--fg-muted)",
                        transition: "color 120ms ease",
                      }}
                    >
                      {editContext === ctx ? "▪ " : ""}{ctx}
                    </button>
                  ))}
                </div>
              )}
              {/* Stake */}
              <div style={{ borderBottom: "1px solid var(--border)" }}>
                <input
                  type="text"
                  value={editStake}
                  onChange={(e) => setEditStake(e.target.value)}
                  placeholder={t.stakePlaceholder}
                  className="journal-input w-full bg-transparent py-2 font-sans text-sm outline-none"
                  style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
                />
              </div>
              {/* Gap */}
              <div style={{ borderBottom: "1px dashed color-mix(in oklch, var(--due-today) 55%, transparent)" }}>
                <textarea
                  rows={2}
                  value={editGap}
                  onChange={(e) => setEditGap(e.target.value)}
                  placeholder={t.gapPlaceholder}
                  className="journal-input w-full resize-none bg-transparent py-2 font-sans text-sm leading-relaxed outline-none"
                  style={{ color: "var(--fg)", caretColor: "var(--due-today)" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTags((prev) => prev.filter((tg) => tg !== tag))}
              className="group flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[11px]"
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
            placeholder={t.tagPlaceholder}
            className="journal-input min-w-[60px] flex-1 bg-transparent font-sans text-[11px] outline-none"
            style={{ color: "var(--fg-muted)" }}
          />
        </div>

        {/* Save / Cancel */}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={handleCancel}
            className="rounded-lg px-3 py-1.5 font-sans text-xs transition-opacity hover:opacity-60"
            style={{ color: "var(--fg-muted)" }}
          >
            {t.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={!content.trim() || saving}
            className="rounded-lg px-3 py-1.5 font-sans text-xs font-medium transition-opacity"
            style={{ background: "var(--fg)", color: "var(--bg)", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "…" : t.save}
          </button>
        </div>
      </div>
    );
  }

  // ── Read mode ───────────────────────────────────────────────────────────────

  return (
    <div
      className={`group relative ${cardClass}`}
      style={cardStyle}
      onMouseLeave={() => setPendingDelete(false)}
    >
      {/* Action buttons — always visible on mobile, hover-revealed on desktop */}
      <div className="absolute right-3 top-3 flex gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
        <button
          onClick={handleEditStart}
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--accent-soft)]"
          style={{ color: "var(--fg-muted)" }}
          aria-label={t.edit}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        {pendingDelete ? (
          <>
            <button
              onClick={handleDelete}
              className="rounded-lg px-2 py-1 font-sans text-[11px] font-medium transition-opacity hover:opacity-80"
              style={{ background: "var(--due-overdue-bg)", color: "var(--due-overdue)" }}
            >
              {t.delete}
            </button>
            <button
              onClick={() => setPendingDelete(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-opacity hover:opacity-60"
              style={{ color: "var(--fg-muted)" }}
              aria-label={t.cancel}
            >
              ✕
            </button>
          </>
        ) : (
          <button
            onClick={() => setPendingDelete(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[oklch(55%_0.18_25/0.1)]"
            style={{ color: "var(--fg-muted)" }}
            aria-label={t.delete}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      {entry.content ? (
        <div
          className={`md leading-relaxed ${flat ? "text-[17px] pr-8" : "text-base pr-16 sm:pr-8"}`}
          style={{ fontFamily: "var(--font-body)" }}
          dangerouslySetInnerHTML={{ __html: mdHtml }}
        />
      ) : null}

      {/* Attachments */}
      {entry.attachments && entry.attachments.length > 0 && (
        <div className={`flex flex-col gap-2 ${entry.content ? "mt-3" : "mt-0 pr-16 sm:pr-4"}`}>
          {entry.attachments.map((att, i) => (
            <AttachmentView key={i} att={att} />
          ))}
        </div>
      )}

      {/* Context meta — source / stake / gap */}
      {hasContextData && (
        <div
          className="mt-3 flex flex-col gap-1"
          style={{ borderTop: "1px solid var(--border)", paddingTop: "0.6rem" }}
        >
          {entry.source && (
            <div className="flex items-baseline gap-2 min-w-0">
              <span
                className="flex-shrink-0 font-sans text-[10px] uppercase tracking-wide"
                style={{ color: "var(--fg-muted)", opacity: 0.6, minWidth: "3rem" }}
              >
                {t.sourceLabel}
              </span>
              <SourceValue source={entry.source} />
            </div>
          )}
          {entry.stake && (
            <div className="flex items-baseline gap-2 min-w-0">
              <span
                className="flex-shrink-0 font-sans text-[10px] uppercase tracking-wide"
                style={{ color: "var(--fg-muted)", opacity: 0.6, minWidth: "3rem" }}
              >
                {t.stakeLabel}
              </span>
              <span
                className="font-sans text-xs"
                style={{ color: "var(--fg)", fontStyle: "italic", wordBreak: "break-word" }}
              >
                {entry.stake}
              </span>
            </div>
          )}
          {entry.gap && (
            <div className="flex items-baseline gap-2 min-w-0">
              <span
                className="flex-shrink-0 font-sans text-[10px] uppercase tracking-wide"
                style={{ color: "var(--fg-muted)", opacity: 0.6, minWidth: "3rem" }}
              >
                {t.gapLabel}
              </span>
              <span className="flex items-center gap-1.5 min-w-0">
                {/* Gap status indicator — amber = open, muted = no status yet */}
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: entry.gapStatus === "resolved"
                      ? "var(--accent)"
                      : entry.gapStatus === "archived"
                        ? "var(--fg-muted)"
                        : "var(--due-today)",  // open / undefined → amber
                  }}
                />
                <span
                  className="font-sans text-xs"
                  style={{ color: "var(--fg-muted)", wordBreak: "break-word" }}
                >
                  {entry.gap}
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tags + type badge + time */}
      <div className={`flex flex-wrap items-center gap-1.5 ${flat ? "mt-3" : "mt-3.5"}`}>
        {entry.entryType && (
          <span
            className="rounded-full px-2 py-0.5 font-sans text-[11px] font-medium"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent)",
              border: "1px solid color-mix(in oklch, var(--accent), transparent 70%)",
            }}
          >
            {(t[`type${entry.entryType.charAt(0).toUpperCase()}${entry.entryType.slice(1)}` as keyof typeof t] as string | undefined)
              ?? (entry.entryType.charAt(0).toUpperCase() + entry.entryType.slice(1))}
          </span>
        )}
        {entry.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onTagClick?.(tag)}
            className="rounded-full px-2 py-0.5 font-sans text-[11px] transition-opacity hover:opacity-70"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent)",
              cursor: onTagClick ? "pointer" : "default",
            }}
          >
            #{tag}
          </button>
        ))}
        {!flat && (
          <span className="ml-auto flex items-center gap-1 font-sans text-[11px]" style={{ color: "var(--fg-muted)" }}>
            {entry.context && (
              <>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flexShrink: 0, opacity: 0.7 }}>
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                <span>{entry.context}</span>
                <span aria-hidden style={{ opacity: 0.35 }}>·</span>
              </>
            )}
            {time}
          </span>
        )}
      </div>
    </div>
  );
}
