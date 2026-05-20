"use client";

import { useState, useEffect, useRef } from "react";
import { searchEntries } from "@/lib/db";
import type { Entry } from "@/types/entry";
import { useT } from "@/lib/i18n";
import { useSettings, locale } from "@/lib/settings-context";

function highlight(text: string, query: string) {
  const parts: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  const lq = query.toLowerCase();
  let pos = 0;
  let idx = lower.indexOf(lq, pos);
  while (idx !== -1) {
    if (idx > pos) parts.push({ text: text.slice(pos, idx), match: false });
    parts.push({ text: text.slice(idx, idx + query.length), match: true });
    pos = idx + query.length;
    idx = lower.indexOf(lq, pos);
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), match: false });
  return parts;
}

function excerpt(content: string, query: string): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, 160) + (content.length > 160 ? "…" : "");
  const start = Math.max(0, idx - 55);
  const end = Math.min(content.length, idx + query.length + 100);
  return (start > 0 ? "…" : "") + content.slice(start, end) + (end < content.length ? "…" : "");
}

interface Props {
  onClose: () => void;
}

export default function SearchModal({ onClose }: Props) {
  const t = useT();
  const { settings } = useSettings();
  const loc = locale(settings);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      const res = await searchEntries(q);
      setResults(res);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim();

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: "oklch(0% 0 0 / 0.45)" }} onClick={onClose} />

      <div
        className="scale-in fixed z-50 flex flex-col
                   bottom-0 left-0 right-0 max-h-[88dvh] rounded-t-3xl
                   sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-[14%]
                   sm:w-[560px] sm:max-h-[66dvh] sm:-translate-x-1/2 sm:rounded-3xl"
        style={{
          background: "var(--bg-card)",
          boxShadow: "0 -4px 40px oklch(0% 0 0 / 0.25), var(--shadow-form)",
        }}
      >
        {/* Mobile drag handle */}
        <div className="mx-auto mt-3 h-1 w-10 flex-shrink-0 rounded-full sm:hidden" style={{ background: "var(--border-focus)" }} />

        {/* Input row */}
        <div className="flex flex-shrink-0 items-center gap-3 px-5 py-4 sm:px-6">
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: "var(--fg-muted)", flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="flex-1 bg-transparent font-sans text-base outline-none"
            style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
          />
          {q && (
            <button
              onClick={() => setQuery("")}
              className="font-sans text-lg leading-none transition-opacity hover:opacity-60"
              style={{ color: "var(--fg-muted)" }}
            >
              ×
            </button>
          )}
          <kbd
            className="hidden rounded-lg px-2 py-1 font-sans text-[10px] sm:block"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--fg-muted)" }}
          >
            esc
          </kbd>
        </div>

        <div className="h-px flex-shrink-0" style={{ background: "var(--border)" }} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-10">
              <div
                className="h-4 w-4 animate-spin rounded-full border-2"
                style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }}
              />
            </div>
          )}

          {!loading && !q && (
            <p
              className="py-12 text-center font-sans text-sm"
              style={{ color: "var(--fg-muted)", opacity: 0.45 }}
            >
              {t.searchEmpty}
            </p>
          )}

          {!loading && q && results.length === 0 && (
            <p
              className="py-12 text-center font-serif italic text-base"
              style={{ color: "var(--fg-muted)", opacity: 0.6 }}
            >
              {t.searchNoResults}
            </p>
          )}

          {!loading && results.length > 0 && (
            <ul className="flex flex-col py-1.5">
              {results.map((entry) => {
                const dateLabel = new Date(entry.date + "T00:00:00").toLocaleDateString(loc, {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                });
                const exText = entry.content ? excerpt(entry.content, q) : "";
                const parts = exText ? highlight(exText, q) : [];

                return (
                  <li
                    key={entry._id}
                    className="flex flex-col gap-1.5 px-5 py-3 transition-colors hover:bg-[var(--accent-soft)] sm:px-6"
                  >
                    <span
                      className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {dateLabel}
                    </span>

                    {parts.length > 0 && (
                      <p
                        className="line-clamp-2 font-sans text-sm leading-relaxed"
                        style={{ color: "var(--fg)", fontFamily: "var(--font-body)" }}
                      >
                        {parts.map((part, i) =>
                          part.match ? (
                            <mark
                              key={i}
                              style={{
                                background: "var(--accent-soft)",
                                color: "var(--accent)",
                                borderRadius: "3px",
                                padding: "0 2px",
                              }}
                            >
                              {part.text}
                            </mark>
                          ) : (
                            <span key={i}>{part.text}</span>
                          )
                        )}
                      </p>
                    )}

                    {entry.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full px-2 py-0.5 font-sans text-[10px]"
                            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <>
            <div className="h-px flex-shrink-0" style={{ background: "var(--border)" }} />
            <div
              className="flex flex-shrink-0 items-center justify-between px-5 py-2.5 sm:px-6"
            >
              <span className="font-sans text-[10px]" style={{ color: "var(--fg-muted)", opacity: 0.5 }}>
                {results.length} {results.length === 1 ? t.entry : t.entries}
              </span>
              <span className="hidden font-sans text-[10px] sm:block" style={{ color: "var(--fg-muted)", opacity: 0.4 }}>
                ⌘K
              </span>
            </div>
          </>
        )}

        <div className="flex-shrink-0 pb-[max(8px,env(safe-area-inset-bottom))] sm:pb-1" />
      </div>
    </>
  );
}
