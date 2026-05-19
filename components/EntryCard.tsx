"use client";

import { useState } from "react";
import type { Entry } from "@/types/entry";
import { updateEntry, deleteEntry } from "@/lib/db";

interface Props {
  entry: Entry;
  onDelete?: (id: string) => void;
  onUpdate?: (entry: Entry) => void;
}

export default function EntryCard({ entry, onDelete, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(entry.content);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(entry.tags);
  const [saving, setSaving] = useState(false);

  const time = new Date(entry.createdAt).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  function handleEditStart() {
    setContent(entry.content);
    setTags(entry.tags);
    setTagInput("");
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
      const updated = await updateEntry(entry, content.trim(), finalTags);
      onUpdate?.(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const [pendingDelete, setPendingDelete] = useState(false);

  async function handleDelete() {
    await deleteEntry(entry._id);
    onDelete?.(entry._id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  }

  const cardStyle = {
    background: "var(--bg-card)",
    boxShadow: "var(--shadow-card)",
    borderLeft: "2px solid var(--accent)",
  };

  if (editing) {
    return (
      <div className="rounded-xl px-4 py-3.5" style={cardStyle}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          rows={Math.max(3, content.split("\n").length + 1)}
          className="journal-input w-full resize-none bg-transparent font-sans text-sm leading-relaxed outline-none"
          style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
        />

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
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
            placeholder="Tag..."
            className="journal-input min-w-[60px] flex-1 bg-transparent font-sans text-[11px] outline-none"
            style={{ color: "var(--fg-muted)" }}
          />
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={handleCancel}
            className="rounded-lg px-3 py-1.5 font-sans text-xs transition-opacity hover:opacity-60"
            style={{ color: "var(--fg-muted)" }}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={!content.trim() || saving}
            className="rounded-lg px-3 py-1.5 font-sans text-xs font-medium transition-opacity"
            style={{
              background: "var(--fg)",
              color: "var(--bg)",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "…" : "Speichern"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group relative rounded-xl px-4 py-3.5"
      style={cardStyle}
    >
      {/* Action buttons — always on mobile, hover on desktop */}
      <div className="absolute right-3 top-3 flex gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
        <button
          onClick={handleEditStart}
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--accent-soft)]"
          style={{ color: "var(--fg-muted)" }}
          aria-label="Bearbeiten"
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
              Löschen
            </button>
            <button
              onClick={() => setPendingDelete(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-opacity hover:opacity-60"
              style={{ color: "var(--fg-muted)" }}
              aria-label="Abbrechen"
            >
              ✕
            </button>
          </>
        ) : (
          <button
            onClick={() => setPendingDelete(true)}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[oklch(55%_0.18_25/0.1)]"
            style={{ color: "var(--fg-muted)" }}
            aria-label="Löschen"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        )}
      </div>

      <p
        className="whitespace-pre-wrap font-sans text-sm leading-relaxed pr-16 sm:pr-4"
        style={{ color: "var(--fg)" }}
      >
        {entry.content}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {entry.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full px-2 py-0.5 font-sans text-[11px]"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            #{tag}
          </span>
        ))}
        <span className="ml-auto font-sans text-[11px]" style={{ color: "var(--fg-muted)" }}>
          {time}
        </span>
      </div>
    </div>
  );
}
