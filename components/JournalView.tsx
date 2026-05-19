"use client";

import { useState, useEffect } from "react";
import { getEntriesByDate, getEntriesByTag, getStreakData } from "@/lib/db";
import type { Entry } from "@/types/entry";
import { useSettings, locale } from "@/lib/settings-context";
import EntryForm from "./EntryForm";
import EntryCard from "./EntryCard";

function todayDate() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(dateStr: string, loc: string) {
  const d = new Date(dateStr + "T00:00:00");
  return {
    weekday: d.toLocaleDateString(loc, { weekday: "long" }),
    full: d.toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric" }),
  };
}

// ─── Streak badge ─────────────────────────────────────────────────────────────
// 4 heat levels based on consecutive days. Colors shift amber → orange → red-orange.
// Level 4 (30+ days) pulses via CSS animation.

// Show from day 1. Thresholds: 1 / 4 / 10 / 30+
function streakLevel(n: number): 0 | 1 | 2 | 3 | 4 {
  if (n < 1)  return 0;
  if (n < 4)  return 1;
  if (n < 10) return 2;
  if (n < 30) return 3;
  return 4;
}

// Colors via CSS vars — each theme defines --streak-{1-4} for correct contrast
const HEAT: Record<1 | 2 | 3 | 4, { shadow: string; pulse: boolean }> = {
  1: { shadow: "none",                                                                                           pulse: false },
  2: { shadow: "0 0 10px color-mix(in oklch, var(--streak-2), transparent 65%)",                               pulse: false },
  3: { shadow: "0 0 14px color-mix(in oklch, var(--streak-3), transparent 50%)",                               pulse: false },
  4: { shadow: "0 0 18px color-mix(in oklch, var(--streak-4), transparent 35%)",                               pulse: true  },
};

function FlameIcon() {
  return (
    <svg width="11" height="14" viewBox="0 0 24 28" fill="currentColor" aria-hidden>
      <path d="M12 0C11 4 8 6.5 6 10 4 13.5 4 16.5 4 18a8 8 0 0016 0c0-3-1.5-5.5-3.5-8-.7-1-1.3-2.2-1.5-3.5-.8 2-2 3.5-2 5.5a3 3 0 01-6 0c0-2.5 1.5-4.5 5-8 .5-.5.8-1.3 1-2z"/>
    </svg>
  );
}

function StreakBadge({ streak, lang }: { streak: number; lang: "de" | "en" }) {
  const level = streakLevel(streak);
  if (level === 0) return null;
  const h = HEAT[level];
  const cv = `var(--streak-${level})`;
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-sans text-sm font-semibold transition-all duration-500${h.pulse ? " streak-pulse" : ""}`}
      style={{
        color: cv,
        background: `color-mix(in oklch, ${cv}, transparent 84%)`,
        boxShadow: h.shadow,
      }}
      title={lang === "de" ? `${streak} Tage in Folge` : `${streak} day streak`}
    >
      <FlameIcon />
      {streak}
    </span>
  );
}

export default function JournalView() {
  const { settings } = useSettings();
  const loc = locale(settings);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);

  const today = todayDate();
  const { weekday, full } = formatDate(today, loc);

  useEffect(() => {
    getStreakData().then(({ streak }) => setStreak(streak));
  }, [entries]);

  useEffect(() => {
    setLoading(true);
    const fetch = filterTag ? getEntriesByTag(filterTag) : getEntriesByDate(today);
    fetch.then(setEntries).finally(() => setLoading(false));
  }, [today, filterTag]);

  function handleSaved(entry: Entry) {
    setEntries((prev) => [...prev, entry]);
    setNewIds((prev) => new Set([...prev, entry._id]));
    setTimeout(() => {
      setNewIds((prev) => { const n = new Set(prev); n.delete(entry._id); return n; });
    }, 800);
  }

  function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e._id !== id));
  }

  function handleUpdate(updated: Entry) {
    setEntries((prev) => prev.map((e) => (e._id === updated._id ? updated : e)));
  }

  return (
    <div className="mx-auto max-w-[620px] px-5 pt-4 pb-4">
      <header className="mb-8 fade-up">
        {filterTag ? (
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-[2rem] font-normal leading-none tracking-tight" style={{ color: "var(--fg)" }}>
              #{filterTag}
            </h1>
            <button
              onClick={() => setFilterTag(null)}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 font-sans text-xs transition-opacity hover:opacity-70"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              × zurück
            </button>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-[2.6rem] font-normal leading-none tracking-tight" style={{ color: "var(--fg)" }}>
              {weekday}
            </h1>
            <div className="mt-2 flex items-center gap-3">
              <p className="font-sans text-sm" style={{ color: "var(--fg-muted)" }}>
                {full}
              </p>
              <StreakBadge streak={streak} lang={settings.language} />
            </div>
          </>
        )}
      </header>

      <div className="fade-up" style={{ animationDelay: "55ms" }}>
        <EntryForm onSaved={handleSaved} />
      </div>

      {!loading && entries.length > 0 && (
        <>
          <div className="my-7 flex items-center gap-4">
            <div className="h-px flex-1" style={{ background: "var(--border)" }} />
            <span className="font-sans text-[10px] font-medium tracking-[0.18em] uppercase" style={{ color: "var(--fg-muted)" }}>
              {filterTag ? `#${filterTag}` : "Heute"} · {entries.length}
            </span>
            <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          </div>
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <div key={entry._id} className={newIds.has(entry._id) ? "entry-appear" : ""}>
                <EntryCard
                  entry={entry}
                  onDelete={handleDelete}
                  onUpdate={handleUpdate}
                  onTagClick={(tag) => { setFilterTag(tag); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && entries.length === 0 && (
        <p className="mt-12 text-center font-serif text-xl italic" style={{ color: "var(--fg-muted)" }}>
          Was bleibt heute hängen?
        </p>
      )}

      {loading && (
        <div className="mt-12 flex justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      )}
    </div>
  );
}
