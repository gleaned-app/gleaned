"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getReviewDue, markReviewed, undoMarkReviewed,
  getRecentEntries, getEntriesForMonth, getEntryMonths,
  getCalibrationData,
} from "@/lib/db";
import type { Entry, ReviewOutcome, GapStatus } from "@/types/entry";
import { computeCalibration } from "@/lib/review-scheduler";
import { AttachmentView } from "./AttachmentView";
import { useT } from "@/lib/i18n";
import { useSettings, locale } from "@/lib/settings-context";
import type { View } from "./BottomNav";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const [dragX, setDragX] = useState(0);

  // Undo — snapshot of the entry before markReviewed wrote to DB
  const [undoEntry, setUndoEntry] = useState<Entry | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // History
  const [history, setHistory] = useState<Entry[]>([]);
  const [allMonths, setAllMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthEntries, setMonthEntries] = useState<Entry[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [showOpenGaps, setShowOpenGaps] = useState(false);
  const [calibration, setCalibration] = useState<number | null | "loading">("loading");

  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingMonth, setLoadingMonth] = useState(false);

  useEffect(() => {
    getReviewDue().then((e) => {
      setQueue(e);
      setTotal(e.length);
      setLoadingQueue(false);
      onCountChange?.(e.length);
    });
    getRecentEntries(60).then((e) => { setHistory(e); setLoadingHistory(false); });
    getEntryMonths().then(setAllMonths);
    getCalibrationData().then((data) => setCalibration(computeCalibration(data)));
  // onCountChange is stable (setState from parent) — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const activeDrag = !slide && dragX !== 0;
  const dragRotate = activeDrag ? Math.max(-7, Math.min(7, dragX * 0.05)) : 0;
  const dragScale = activeDrag ? 1 + Math.min(Math.abs(dragX) / 600, 0.025) : 1;
  const dragTranslate = slide === "left" ? -90 : slide === "right" ? 90 : activeDrag ? dragX : 0;
  const sourceEntries = showOpenGaps
    ? history.filter((e) => e.gapStatus === "open")
    : selectedMonth ? monthEntries : history;
  const sq = searchQuery.trim().toLowerCase();
  const displayHistory = sq
    ? sourceEntries.filter((e) =>
        e.content.toLowerCase().includes(sq) ||
        e.tags.some((t) => t.toLowerCase().includes(sq))
      )
    : sourceEntries;
  const weeks = groupByWeek(displayHistory, tr, loc);

  const isGapMode = current?.gapStatus === "open";

  const clearUndo = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setUndoEntry(null);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoEntry) return;
    clearUndo();
    await undoMarkReviewed(undoEntry);
    setIndex((i) => i - 1);
    onCountChange?.(Math.max(0, total - (index - 1)));
  }, [undoEntry, clearUndo, index, total, onCountChange]);

  const handleReview = useCallback(
    async (outcome: ReviewOutcome, gapUpdate?: GapStatus) => {
      if (!current || slide) return;
      clearUndo();
      const snap = current;
      setSlide(outcome === "still_holds" ? "right" : "left");
      await markReviewed(snap, outcome, gapUpdate);
      setTimeout(() => {
        setSlide(null);
        const next = index + 1;
        setIndex(next);
        onCountChange?.(Math.max(0, total - next));
        setUndoEntry(snap);
        undoTimerRef.current = setTimeout(() => setUndoEntry(null), 3000);
      }, 280);
    },
    [current, slide, index, total, onCountChange, clearUndo]
  );

  function onTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0].clientX);
    setDragX(0);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX === null || slide) return;
    setDragX(e.touches[0].clientX - touchStartX);
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);
    setDragX(0);
    if (Math.abs(diff) > 56) {
      navigator.vibrate?.(8);
      if (isGapMode) {
        handleReview(diff > 0 ? "still_holds" : "needs_revision", diff > 0 ? "resolved" : "open");
      } else {
        handleReview(diff > 0 ? "still_holds" : "needs_revision");
      }
    }
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
        <div className="mb-6 rounded-3xl px-6 py-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="skeleton mb-4 h-5 w-20 rounded-full" />
          <div className="skeleton mb-2.5 h-4 w-full rounded-lg" />
          <div className="skeleton mb-2.5 h-4 w-[85%] rounded-lg" />
          <div className="skeleton h-4 w-[65%] rounded-lg" />
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
          {undoEntry && (
            <div className="mb-3 flex justify-end">
              <button
                onClick={handleUndo}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 font-sans text-xs font-medium transition-opacity hover:opacity-80 active:opacity-60"
                style={{ background: "var(--border)", color: "var(--fg-muted)" }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                </svg>
                {tr.reviewUndo}
              </button>
            </div>
          )}
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="mb-4 select-none"
            style={{
              touchAction: "pan-y",
              transform: (slide || activeDrag) ? `translateX(${dragTranslate}px) rotate(${dragRotate}deg) scale(${dragScale})` : undefined,
              opacity: slide ? 0 : 1,
              transition: slide ? "transform 0.28s cubic-bezier(0.4,0,1,1), opacity 0.22s ease" : "none",
              willChange: (slide || activeDrag) ? "transform" : "auto",
              transformOrigin: "50% 110%",
            }}
          >
            {current && (
              <ReviewCard
                key={current._id}
                entry={current}
                tr={tr}
                dragX={activeDrag ? dragX : 0}
                isGapMode={isGapMode}
              />
            )}
          </div>
          {isGapMode ? (
            <>
              {/* Gap mode: secondary row — still open + archive */}
              <div className="mb-2 flex gap-2">
                <button onClick={() => handleReview("needs_revision", "open")} disabled={!!slide}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-sans text-xs font-medium transition-opacity active:opacity-70 disabled:opacity-40"
                  style={{ background: "var(--due-overdue-bg)", color: "var(--due-overdue)" }}>
                  <IconGapOpen /> {tr.reviewGapStillOpen}
                </button>
                <button onClick={() => handleReview("superseded", "archived")} disabled={!!slide}
                  title={tr.reviewGapArchiveTooltip}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-sans text-xs font-medium transition-opacity active:opacity-70 disabled:opacity-40"
                  style={{ background: "var(--border)", color: "var(--fg-muted)" }}>
                  <IconSuperseded /> {tr.reviewGapArchive}
                </button>
              </div>
              {/* Gap mode: primary — resolved */}
              <button onClick={() => handleReview("still_holds", "resolved")} disabled={!!slide}
                className="btn-3d mb-2 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-sans text-sm font-semibold disabled:opacity-40"
                style={{ minHeight: "3rem" }}>
                <IconCheck /> {tr.reviewGapResolved}
              </button>
              <p className="mb-6 text-center font-sans text-[11px]" style={{ color: "var(--fg-muted)", opacity: 0.45 }}>
                ← {tr.reviewGapStillOpen} &nbsp;·&nbsp; {tr.reviewGapResolved} →
              </p>
            </>
          ) : (
            <>
              {/* Normal mode: secondary row — needs_revision + superseded */}
              <div className="mb-2 flex gap-2">
                <button onClick={() => handleReview("needs_revision")} disabled={!!slide}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-sans text-xs font-medium transition-opacity active:opacity-70 disabled:opacity-40"
                  style={{ background: "var(--due-overdue-bg)", color: "var(--due-overdue)" }}>
                  <IconAgain /> {tr.reviewAgain}
                </button>
                <button onClick={() => handleReview("superseded")} disabled={!!slide}
                  title={tr.reviewSupersededTooltip}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-sans text-xs font-medium transition-opacity active:opacity-70 disabled:opacity-40"
                  style={{ background: "var(--border)", color: "var(--fg-muted)" }}>
                  <IconSuperseded /> {tr.reviewSuperseded}
                </button>
              </div>
              {/* Normal mode: primary — still holds */}
              <button onClick={() => handleReview("still_holds")} disabled={!!slide}
                className="btn-3d mb-2 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-sans text-sm font-semibold disabled:opacity-40"
                style={{ minHeight: "3rem" }}>
                <IconCheck /> {tr.reviewGotIt}
              </button>
              <p className="mb-6 text-center font-sans text-[11px]" style={{ color: "var(--fg-muted)", opacity: 0.45 }}>
                ← {tr.reviewAgain} &nbsp;·&nbsp; {tr.reviewGotIt} →
              </p>
            </>
          )}
        </>
      )}

      {/* ── History ────────────────────────────────────────────────────────── */}
      <div className="mt-2 mb-3 flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        <span className="font-sans text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: "var(--fg-muted)" }}>
          {tr.reviewHistory}
        </span>
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
      </div>
      {calibration !== "loading" && (
        <CalibrationRow score={calibration} tr={tr} />
      )}

      {/* ── Filter row: month chips + tag input ─────────────────────────── */}
      {!loadingHistory && sourceEntries.length > 0 && (
        <div className="mb-5 -mx-5 px-5 overflow-x-auto">
          <div className="flex items-center gap-2 pb-1" style={{ width: "max-content" }}>
            {allMonths.length > 0 && (
              <>
                <button
                  onClick={() => { setSelectedMonth(null); setShowOpenGaps(false); }}
                  className="rounded-full px-3 py-1 font-sans text-xs font-medium transition-opacity hover:opacity-80"
                  style={{
                    background: selectedMonth === null && !showOpenGaps ? "var(--accent-soft)" : "var(--border)",
                    color:      selectedMonth === null && !showOpenGaps ? "var(--accent)"      : "var(--fg-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tr.filterRecent}
                </button>
                {history.some((e) => e.gapStatus === "open") && (
                  <button
                    onClick={() => { setShowOpenGaps((v) => !v); setSelectedMonth(null); }}
                    className="rounded-full px-3 py-1 font-sans text-xs font-medium transition-opacity hover:opacity-80"
                    style={{
                      background: showOpenGaps ? "color-mix(in oklch, var(--due-today) 18%, transparent)" : "var(--border)",
                      color:      showOpenGaps ? "var(--due-today)" : "var(--fg-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tr.filterOpenGaps}
                  </button>
                )}
                {allMonths.map((ym) => (
                  <button
                    key={ym}
                    onClick={() => { setSelectedMonth(ym === selectedMonth ? null : ym); setShowOpenGaps(false); }}
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
                placeholder="search..."
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
        <div className="flex flex-col gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-3 rounded-2xl px-4 py-3"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", opacity: 1 - i * 0.18 }}>
              <div className="skeleton mt-[5px] h-2 w-2 flex-shrink-0 rounded-full" />
              <div className="flex-1">
                <div className="skeleton mb-2 h-3.5 rounded-lg" style={{ width: `${72 - i * 6}%` }} />
                <div className="skeleton h-3 w-1/4 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : displayHistory.length === 0 ? (
        <p className="py-8 text-center font-serif italic" style={{ color: "var(--fg-muted)" }}>
          {searchQuery ? tr.searchNoResults : tr.reviewHistoryEmpty}
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

// Type → prompt text lookup. Fact uses a reveal mechanism instead of text.
const REVIEW_PROMPTS: Partial<Record<string, (tr: ReturnType<typeof useT>) => string>> = {
  insight:     (tr) => tr.reviewPromptInsight,
  technique:   (tr) => tr.reviewPromptTechnique,
  framework:   (tr) => tr.reviewPromptFramework,
  observation: (tr) => tr.reviewPromptObservation,
};

function ReviewCard({
  entry,
  tr,
  dragX = 0,
  isGapMode = false,
}: {
  entry: Entry;
  tr: ReturnType<typeof useT>;
  dragX?: number;
  isGapMode?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);

  const isFact = entry.entryType === "fact";
  const showBlurred = isFact && !revealed;

  const abs = Math.abs(dragX);
  const isRight = dragX > 0;
  const overlayOpacity = Math.min(abs / 180, 0.42);
  const labelOpacity = Math.max(0, Math.min(1, (abs - 28) / 55));
  const overlayPos = isRight ? "75% 20%" : "25% 20%";
  const overlayVar = isRight ? "var(--accent)" : "var(--due-overdue)";

  // Stamp label depends on mode: gap resolving vs normal review
  const stampRight = isGapMode ? tr.reviewGapResolved  : tr.reviewGotIt;
  const stampLeft  = isGapMode ? tr.reviewGapStillOpen : tr.reviewAgain;

  const typePrompt = !isGapMode && entry.entryType ? REVIEW_PROMPTS[entry.entryType]?.(tr) : undefined;

  return (
    <div
      className="rounded-3xl px-6 py-5"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Directional tint overlay */}
      {dragX !== 0 && (
        <div
          style={{
            position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none",
            opacity: overlayOpacity,
            background: `radial-gradient(ellipse at ${overlayPos}, ${overlayVar}, transparent 62%)`,
          }}
        />
      )}

      {/* Stamp */}
      {dragX !== 0 && (
        <div
          style={{
            position: "absolute", top: 18, zIndex: 10, pointerEvents: "none",
            ...(isRight ? { right: 18 } : { left: 18 }),
            opacity: labelOpacity,
            transform: isRight ? "rotate(12deg)" : "rotate(-12deg)",
          }}
        >
          <span style={{
            fontFamily: "var(--font-caveat), cursive", fontSize: "1.05rem",
            fontWeight: 700, letterSpacing: "0.06em", display: "block",
            color: isRight ? "var(--accent)" : "var(--due-overdue)",
            border: `2px solid ${isRight ? "var(--accent)" : "var(--due-overdue)"}`,
            borderRadius: 6, padding: "2px 9px",
          }}>
            {isRight ? stampRight : stampLeft}
          </span>
        </div>
      )}

      {/* Date chip */}
      <span className="mb-3 inline-block rounded-full px-3 py-0.5 font-sans"
        style={{ background: "var(--border)", color: "var(--fg-muted)", fontFamily: "var(--font-caveat), cursive", fontSize: "0.95rem" }}>
        {contextLabel(entry.date, tr)}
      </span>

      {/* Content — blurred for facts until revealed */}
      <div className="relative">
        <p className="mb-4 font-serif leading-relaxed"
          style={{
            color: "var(--fg)", fontSize: "1rem", whiteSpace: "pre-wrap", wordBreak: "break-word",
            maxHeight: showBlurred ? "24vh" : "32vh",
            overflowY: showBlurred ? "hidden" : "auto",
            filter: showBlurred ? "blur(5px)" : "none",
            transition: "filter 280ms ease",
            userSelect: showBlurred ? "none" : "text",
            pointerEvents: showBlurred ? "none" : "auto",
          }}>
          {entry.content}
        </p>
        {showBlurred && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={() => setRevealed(true)}
              className="btn-3d rounded-xl px-5 py-2.5 font-sans text-sm font-semibold"
            >
              {tr.reviewReveal}
            </button>
          </div>
        )}
      </div>

      {/* Attachments — only after fact reveal or for non-fact entries */}
      {(!showBlurred) && entry.attachments && entry.attachments.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {entry.attachments.map((att, i) => (
            <AttachmentView key={i} att={att} />
          ))}
        </div>
      )}

      {/* Gap section — replaces type prompt when gap is open */}
      {isGapMode && entry.gap && (
        <div
          className="mb-3 rounded-2xl px-4 py-3"
          style={{
            background: "color-mix(in oklch, var(--due-today) 12%, transparent)",
            border: "1px solid color-mix(in oklch, var(--due-today) 35%, transparent)",
          }}
        >
          <p className="mb-1 font-sans text-[10px] font-medium uppercase tracking-wider"
            style={{ color: "var(--due-today)" }}>
            {tr.gapLabel}
          </p>
          <p className="mb-2 font-sans text-sm leading-relaxed" style={{ color: "var(--fg)" }}>
            {entry.gap}
          </p>
          <p className="font-serif text-xs italic" style={{ color: "var(--fg-muted)" }}>
            {tr.reviewGapPrompt}
          </p>
        </div>
      )}

      {/* Type-specific prompt — shown in normal mode for non-fact types */}
      {typePrompt && !showBlurred && (
        <p className="mb-3 font-serif text-[13px] italic" style={{ color: "var(--fg-muted)", opacity: 0.75 }}>
          {typePrompt}
        </p>
      )}

      {/* Tags */}
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
  const dotColor =
    entry.lastReviewOutcome === "still_holds"    ? "var(--accent)" :
    entry.lastReviewOutcome === "needs_revision" ? "var(--due-today)" :
    entry.lastReviewOutcome === "superseded"     ? "var(--fg-muted)" :
    (entry.reviewInterval ?? 0) >= 7             ? "var(--due-soon)" :
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

// ─── Calibration row ──────────────────────────────────────────────────────────

function CalibrationRow({ score, tr }: { score: number | null; tr: ReturnType<typeof useT> }) {
  const pct = score !== null ? Math.round(score * 100) : null;
  const dotColor =
    pct === null        ? "var(--fg-muted)" :
    pct >= 75           ? "var(--accent)"   :
    pct >= 50           ? "var(--due-today)":
                          "var(--due-overdue)";

  return (
    <div
      className="mb-4 flex items-center justify-between rounded-xl px-4 py-2.5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "inline-block" }}
        />
        <span className="font-sans text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
          {tr.calibrationLabel}
        </span>
      </div>
      <span
        className="font-sans text-sm font-semibold tabular-nums"
        style={{ color: pct !== null ? dotColor : "var(--fg-muted)", opacity: pct !== null ? 1 : 0.45 }}
      >
        {pct !== null ? `${pct}%` : tr.calibrationNotEnoughData}
      </span>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

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

function IconSuperseded() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
    </svg>
  );
}

function IconGapOpen() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/>
    </svg>
  );
}
