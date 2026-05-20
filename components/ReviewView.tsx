"use client";

import { useState, useEffect, useCallback } from "react";
import { getReviewDue, markReviewed, getRecentEntries } from "@/lib/db";
import type { Entry } from "@/types/entry";
import { useT } from "@/lib/i18n";
import { useSettings, locale } from "@/lib/settings-context";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function daysAgoCount(dateStr: string): number {
  const t = todayStr();
  return Math.round(
    (new Date(t).getTime() - new Date(dateStr).getTime()) / 86_400_000
  );
}

function contextLabel(dateStr: string, tr: ReturnType<typeof useT>): string {
  const d = daysAgoCount(dateStr);
  if (d === 0) return tr.today;
  if (d === 1) return tr.yesterday;
  return tr.reviewDaysAgo(d);
}

function weekLabel(dateStr: string, tr: ReturnType<typeof useT>, loc: string): string {
  const d = daysAgoCount(dateStr);
  if (d < 7)  return tr.thisWeek;
  if (d < 14) return tr.lastWeek;
  if (d < 56) return tr.weeksAgo(Math.floor(d / 7));
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(loc, {
    month: "long",
    year: d > 365 ? "numeric" : undefined,
  });
}

function groupByWeek(
  entries: Entry[],
  tr: ReturnType<typeof useT>,
  loc: string
): { label: string; entries: Entry[] }[] {
  const groups: Map<string, Entry[]> = new Map();
  for (const e of entries) {
    const label = weekLabel(e.date, tr, loc);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(e);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

// ─── Main view ────────────────────────────────────────────────────────────────

type SlideDir = "left" | "right" | null;

export default function ReviewView({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const tr = useT();
  const { settings } = useSettings();
  const loc = locale(settings);

  const [queue, setQueue] = useState<Entry[]>([]);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [slide, setSlide] = useState<SlideDir>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const [history, setHistory] = useState<Entry[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    getReviewDue(10).then((entries) => {
      setQueue(entries);
      setTotal(entries.length);
      setLoadingQueue(false);
    });
    getRecentEntries(60).then((entries) => {
      setHistory(entries);
      setLoadingHistory(false);
    });
  }, []);

  const current = queue[index] ?? null;
  const queueDone = !loadingQueue && index >= total;

  const handleReview = useCallback(
    async (remembered: boolean) => {
      if (!current || slide) return;
      setSlide(remembered ? "right" : "left");
      await markReviewed(current, remembered);
      setTimeout(() => {
        setSlide(null);
        const next = index + 1;
        setIndex(next);
        onCountChange?.(Math.max(0, total - next));
      }, 280);
    },
    [current, slide, index, total, onCountChange]
  );

  function onTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0].clientX);
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(diff) > 56) handleReview(diff > 0);
  }

  const weeks = groupByWeek(history, tr, loc);

  return (
    <div className="mx-auto max-w-[580px] px-5 pt-6 pb-10">
      {/* Header */}
      <div className="mb-5 flex items-baseline justify-between">
        <h2
          className="text-2xl"
          style={{ color: "var(--fg)", fontFamily: "var(--font-caveat), cursive", fontWeight: 500 }}
        >
          {tr.reviewTitle}
        </h2>
        {!queueDone && total > 0 && (
          <span className="font-sans text-xs tabular-nums" style={{ color: "var(--fg-muted)" }}>
            {tr.reviewOf(index, total)}
          </span>
        )}
      </div>

      {/* ── Queue section ─────────────────────────────────────────────────── */}
      {loadingQueue ? (
        <div className="mb-6 flex justify-center py-8">
          <span className="h-5 w-5 animate-spin rounded-full border-2"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      ) : queueDone || total === 0 ? (
        /* Empty queue — compact notice */
        <div
          className="mb-6 flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}
        >
          <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--accent-soft)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          <div>
            <p className="font-sans text-sm font-medium" style={{ color: "var(--fg)" }}>
              {tr.reviewEmpty}
            </p>
            <p className="font-sans text-xs" style={{ color: "var(--fg-muted)" }}>
              {tr.reviewEmptyBody}
            </p>
          </div>
        </div>
      ) : (
        /* Active queue */
        <>
          {/* Progress */}
          <div className="mb-4 h-[3px] w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${(index / total) * 100}%`,
                background: "var(--accent)",
                transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)",
              }}
            />
          </div>

          {/* Card */}
          <div
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className="mb-4 select-none"
            style={{
              transform: slide === "left" ? "translateX(-90px)" : slide === "right" ? "translateX(90px)" : "translateX(0)",
              opacity: slide ? 0 : 1,
              transition: slide ? "transform 0.28s cubic-bezier(0.4,0,1,1), opacity 0.22s ease" : "none",
            }}
          >
            {current && <ReviewCard entry={current} tr={tr} />}
          </div>

          {/* Action buttons */}
          <div className="mb-2 flex gap-3">
            <button
              onClick={() => handleReview(false)}
              disabled={!!slide}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 font-sans text-sm font-medium transition-opacity active:opacity-70 disabled:opacity-40"
              style={{ background: "var(--due-overdue-bg)", color: "var(--due-overdue)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
              </svg>
              {tr.reviewAgain}
            </button>
            <button
              onClick={() => handleReview(true)}
              disabled={!!slide}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 font-sans text-sm font-medium transition-opacity active:opacity-70 disabled:opacity-40"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {tr.reviewGotIt}
            </button>
          </div>
          <p className="mb-6 text-center font-sans text-[11px]" style={{ color: "var(--fg-muted)", opacity: 0.45 }}>
            ← {tr.reviewAgain} &nbsp;·&nbsp; {tr.reviewGotIt} →
          </p>
        </>
      )}

      {/* ── History section ───────────────────────────────────────────────── */}
      <div className="mt-2 flex items-center gap-3 mb-5">
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        <span className="font-sans text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: "var(--fg-muted)" }}>
          {tr.reviewHistory}
        </span>
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
      </div>

      {loadingHistory ? (
        <div className="flex justify-center py-8">
          <span className="h-4 w-4 animate-spin rounded-full border-2"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      ) : history.length === 0 ? (
        <p className="py-8 text-center font-serif italic" style={{ color: "var(--fg-muted)" }}>
          {tr.addFirstGoal}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {weeks.map(({ label, entries }) => (
            <div key={label}>
              <p
                className="mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.14em]"
                style={{ color: "var(--fg-muted)" }}
              >
                {label}
              </p>
              <div className="flex flex-col gap-1.5">
                {entries.map((entry) => (
                  <HistoryRow key={entry._id} entry={entry} loc={loc} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Review card ──────────────────────────────────────────────────────────────

function ReviewCard({ entry, tr }: { entry: Entry; tr: ReturnType<typeof useT> }) {
  return (
    <div
      className="fade-up rounded-3xl px-6 py-5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}
    >
      <span
        className="mb-3 inline-block rounded-full px-3 py-0.5 font-sans text-sm"
        style={{
          background: "var(--border)",
          color: "var(--fg-muted)",
          fontFamily: "var(--font-caveat), cursive",
          fontSize: "0.95rem",
        }}
      >
        {contextLabel(entry.date, tr)}
      </span>
      <p
        className="mb-4 font-serif leading-relaxed"
        style={{ color: "var(--fg)", fontSize: "1rem", maxHeight: "38vh", overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      >
        {entry.content}
      </p>
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span key={tag} className="rounded-full px-2.5 py-0.5 font-sans text-[11px]"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── History row ──────────────────────────────────────────────────────────────

function HistoryRow({ entry, loc }: { entry: Entry; loc: string }) {
  const dateLabel = new Date(entry.date + "T00:00:00").toLocaleDateString(loc, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const snippet = entry.content.replace(/\n/g, " ").slice(0, 90) + (entry.content.length > 90 ? "…" : "");

  const interval = entry.reviewInterval ?? 0;
  const intervalColor =
    interval >= 30 ? "var(--accent)" :
    interval >= 7  ? "var(--due-soon)" :
    interval >= 2  ? "var(--fg-muted)" :
                     "var(--border-focus)";

  return (
    <div
      className="flex items-start gap-3 rounded-2xl px-4 py-3"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}
    >
      {/* Review strength dot */}
      <span
        className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
        title={interval > 0 ? `${interval}d interval` : "not reviewed yet"}
        style={{ background: intervalColor, marginTop: 5 }}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-sm leading-relaxed" style={{ color: "var(--fg)" }}>
          {snippet}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-sans text-[11px]" style={{ color: "var(--fg-muted)" }}>
            {dateLabel}
          </span>
          {entry.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="font-sans text-[11px]" style={{ color: "var(--fg-muted)" }}>
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
