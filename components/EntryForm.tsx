"use client";

import { useState, useRef } from "react";
import { saveEntry } from "@/lib/db";
import type { Entry } from "@/types/entry";

interface Props {
  onSaved: (entry: Entry) => void;
}

export default function EntryForm({ onSaved }: Props) {
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!content.trim() || saving) return;
    setSaving(true);
    try {
      const finalTags = tagInput.trim()
        ? [...tags, tagInput.trim().toLowerCase().replace(/^#/, "")]
        : tags;
      const entry = await saveEntry(content.trim(), finalTags);
      onSaved(entry);
      setContent("");
      setTags([]);
      setTagInput("");
      textareaRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit();
  }

  const hasContent = content.trim().length > 0;

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

      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-1">
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
