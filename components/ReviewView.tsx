"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getReviewDue, markReviewed,
  getRecentEntries, getEntriesForMonth, getEntryMonths,
} from "@/lib/db";
import type { Entry } from "@/types/entry";
import { useT } from "@/lib/i18n";
import { useSettings, locale } from "@/lib/settings-context";
import type { View } from "./BottomNav";

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

function monthChipLabel(ym: string, loc: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(loc, { month: "short", year: "2-digit" });
}

// ─── Main view ────────────────────────────────────────────────────────────────

type SlideDir = "left" | "right" | null;

export default function ReviewView({
  onCountChange,
  onNavigate,
}: {
  onCountChange?: (n: number) => void;
  onNavigate?: (view: View, date?: string) => void;
}) {
  const tr = useT();
  const { settings } = useSettings();
  const loc = locale(settings);

  // Queue
  const [queue, setQueue] = useState<Entry[]>([]);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [slide, setSlide] = useState<SlideDir>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // History
  const [history, setHistory] = useState<Entry[]>([]);
  const [allMonths, setAllMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthEntries, setMonthEntries] = useState<Entry[]>([]);

  const [searchQuery, setSearchQuery] = useState("");

  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingMonth, setLoadingMonth] = useState(false);

  useEffect(() => {
    getReviewDue(10).then((e) => { setQueue(e); setTotal(e.length); setLoadingQueue(false); });
    getRecentEntries(60).then((e) => { setHistory(e); setLoadingHistory(false); });
    getEntryMonths().then(setAllMonths);
  }, []);

  // Load entries when month filter changes
  useEffect(() => {
    if (!selectedMonth) return;
    setLoadingMonth(true);
    setSearchQuery("");
    const [y, m] = selectedMonth.split("-").map(Number);
    getEntriesForMonth(y, m - 1)
      .then((e) => setMonthEntries(e.sort((a: Entry, b: Entry) => b.createdAt.localeCompare(a.createdAt))))
      .finally(() => setLoadingMonth(false));
  }, [selectedMonth]);

  const current = queue[index] ?? null;
  const queueDone = !loadingQueue && index >= total;
  const sourceEntries = selectedMonth ? monthEntries : history;
  const displayHistory = searchQuery.trim()
    ? sourceEntries.filter((e) =>
        e.tags.some((t) => t.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      )
    : sourceEntries;
  const weeks = groupByWeek(displayHistory, tr, loc);

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

  function onTouchStart(e: React.TouchEvent) { setTouchStartX(e.touches[0].clientX); }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(diff) > 56) handleReview(diff > 0);
  }

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

      {/* ── Queue ─────────────────────────────────────────────────────────── */}
      {loadingQueue ? (
        <div className="mb-6 flex justify-center py-8">
          <Spinner />
        </div>
      ) : queueDone || total === 0 ? (
        <div
          className="mb-6 flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent-soft)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          <div>
            <p className="font-sans text-sm font-medium" style={{ color: "var(--fg)" }}>{tr.reviewEmpty}</p>
            <p className="font-sans text-xs" style={{ color: "var(--fg-muted)" }}>{tr.reviewEmptyBody}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 h-[3px] w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
            <div className="h-full rounded-full"
              style={{ width: `${(index / total) * 100}%`, background: "var(--accent)", transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)" }} />
          </div>
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
          <div className="mb-2 flex gap-3">
            <button onClick={() => handleReview(false)} disabled={!!slide}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 font-sans text-sm font-medium transition-opacity active:opacity-70 disabled:opacity-40"
              style={{ background: "var(--due-overdue-bg)", color: "var(--due-overdue)" }}>
              <IconAgain /> {tr.reviewAgain}
            </button>
            <button onClick={() => handleReview(true)} disabled={!!slide}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 font-sans text-sm font-medium transition-opacity active:opacity-70 disabled:opacity-40"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              <IconCheck /> {tr.reviewGotIt}
            </button>
          </div>
          <p className="mb-6 text-center font-sans text-[11px]" style={{ color: "var(--fg-muted)", opacity: 0.45 }}>
            ← {tr.reviewAgain} &nbsp;·&nbsp; {tr.reviewGotIt} →
          </p>
        </>
      )}

      {/* ── History ────────────────────────────────────────────────────────── */}
      <div className="mt-2 mb-4 flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        <span className="font-sans text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: "var(--fg-muted)" }}>
          {tr.reviewHistory}
        </span>
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
      </div>

      {/* ── Filter row: month chips + tag input ─────────────────────────── */}
      {!loadingHistory && sourceEntries.length > 0 && (
        <div className="mb-5 -mx-5 px-5 overflow-x-auto">
          <div className="flex items-center gap-2 pb-1" style={{ width: "max-content" }}>
            {allMonths.length > 0 && (
              <>
                <button
                  onClick={() => setSelectedMonth(null)}
                  className="rounded-full px-3 py-1 font-sans text-xs font-medium transition-opacity hover:opacity-80"
                  style={{
                    background: selectedMonth === null ? "var(--accent-soft)" : "var(--border)",
                    color:      selectedMonth === null ? "var(--accent)"      : "var(--fg-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tr.filterRecent}
                </button>
                {allMonths.map((ym) => (
                  <button
                    key={ym}
                    onClick={() => setSelectedMonth(ym === selectedMonth ? null : ym)}
                    className="rounded-full px-3 py-1 font-sans text-xs font-medium transition-opacity hover:opacity-80"
                    style={{
                      background: selectedMonth === ym ? "var(--accent-soft)" : "var(--border)",
                      color:      selectedMonth === ym ? "var(--accent)"      : "var(--fg-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {monthChipLabel(ym, loc)}
                  </button>
                ))}
                <div className="h-4 w-px flex-shrink-0" style={{ background: "var(--border)" }} />
              </>
            )}

            {/* Compact tag filter chip */}
            <div
              className="flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors"
              style={{ background: searchQuery ? "var(--accent-soft)" : "var(--border)" }}
            >
              <span
                className="font-sans text-xs font-semibold select-none flex-shrink-0"
                style={{ color: "var(--accent)" }}
              >
                #
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.replace(/^#/, ""))}
                placeholder="tag..."
                size={searchQuery ? Math.max(4, searchQuery.length + 1) : 4}
                className="bg-transparent font-sans text-xs outline-none"
                style={{ color: searchQuery ? "var(--accent)" : "var(--fg-muted)" }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="flex-shrink-0 font-sans text-xs leading-none transition-opacity hover:opacity-60"
                  style={{ color: "var(--accent)" }}
                >
                  x
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History list */}
      {loadingHistory || loadingMonth ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : displayHistory.length === 0 ? (
        <p className="py-8 text-center font-serif italic" style={{ color: "var(--fg-muted)" }}>
          {searchQuery ? tr.searchNoResults : tr.addFirstGoal}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {weeks.map(({ label, entries }) => (
            <div key={label}>
              <p className="mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--fg-muted)" }}>
                {label}
              </p>
              <div className="flex flex-col gap-1.5">
                {entries.map((entry) => (
                  <HistoryRow
                    key={entry._id}
                    entry={entry}
                    loc={loc}
                    onClick={onNavigate ? () => onNavigate("calendar", entry.date) : undefined}
                  />
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
    <div className="fade-up rounded-3xl px-6 py-5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
      <span className="mb-3 inline-block rounded-full px-3 py-0.5 font-sans text-sm"
        style={{ background: "var(--border)", color: "var(--fg-muted)", fontFamily: "var(--font-caveat), cursive", fontSize: "0.95rem" }}>
        {contextLabel(entry.date, tr)}
      </span>
      <p className="mb-4 font-serif leading-relaxed"
        style={{ color: "var(--fg)", fontSize: "1rem", maxHeight: "38vh", overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
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

function HistoryRow({ entry, loc, onClick }: { entry: Entry; loc: string; onClick?: () => void }) {
  const dateLabel = new Date(entry.date + "T00:00:00").toLocaleDateString(loc, {
    weekday: "short", day: "numeric", month: "short",
  });
  const snippet = entry.content.replace(/\n/g, " ").slice(0, 90) + (entry.content.length > 90 ? "…" : "");
  const interval = entry.reviewInterval ?? 0;
  const dotColor =
    interval >= 30 ? "var(--accent)" :
    interval >= 7  ? "var(--due-soon)" :
    interval >= 2  ? "var(--fg-muted)" :
                     "var(--border-focus)";

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
      className="flex items-start gap-3 rounded-2xl px-4 py-3 transition-opacity"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card)",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span className="mt-[5px] h-2 w-2 flex-shrink-0 rounded-full" style={{ background: dotColor }} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-sm leading-relaxed" style={{ color: "var(--fg)" }}>
          {snippet}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-sans text-[11px]" style={{ color: "var(--fg-muted)" }}>{dateLabel}</span>
          {entry.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="font-sans text-[11px]" style={{ color: "var(--fg-muted)" }}>#{tag}</span>
          ))}
        </div>
      </div>
      {onClick && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="mt-1 flex-shrink-0" style={{ color: "var(--fg-muted)", opacity: 0.4 }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      )}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2"
      style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
  );
}

function IconAgain() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
