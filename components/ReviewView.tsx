"use client";

import { useState, useEffect, useCallback } from "react";
import { getReviewDue, markReviewed } from "@/lib/db";
import type { Entry } from "@/types/entry";
import { useT } from "@/lib/i18n";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function contextLabel(dateStr: string, tr: ReturnType<typeof useT>): string {
  const t = today();
  const diff = Math.round(
    (new Date(t).getTime() - new Date(dateStr).getTime()) / 86_400_000
  );
  if (diff === 0) return tr.today;
  if (diff === 1) return tr.yesterday;
  return tr.reviewDaysAgo(diff);
}

// ─── Component ────────────────────────────────────────────────────────────────

type SlideDir = "left" | "right" | null;

export default function ReviewView({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const tr = useT();
  const [queue, setQueue] = useState<Entry[]>([]);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState<SlideDir>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    getReviewDue(10).then((entries) => {
      setQueue(entries);
      setTotal(entries.length);
      setLoading(false);
    });
  }, []);

  const current = queue[index] ?? null;
  const done = index;
  const finished = !loading && done >= total;

  const handleReview = useCallback(
    async (remembered: boolean) => {
      if (!current || slide) return;
      setSlide(remembered ? "right" : "left");
      await markReviewed(current, remembered);
      setTimeout(() => {
        setSlide(null);
        setIndex((i) => i + 1);
        onCountChange?.(Math.max(0, total - (index + 1)));
      }, 280);
    },
    [current, slide, index, total, onCountChange]
  );

  // Swipe handling
  function onTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0].clientX);
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(diff) > 56) handleReview(diff > 0);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span
          className="h-5 w-5 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[520px] flex-col px-5 pt-6 pb-10">
      {/* Header */}
      <div className="mb-6 flex items-baseline justify-between">
        <h2
          className="text-2xl"
          style={{
            color: "var(--fg)",
            fontFamily: "var(--font-caveat), cursive",
            fontWeight: 500,
          }}
        >
          {tr.reviewTitle}
        </h2>
        {!finished && total > 0 && (
          <span className="font-sans text-xs tabular-nums" style={{ color: "var(--fg-muted)" }}>
            {tr.reviewOf(done, total)}
          </span>
        )}
      </div>

      {finished || total === 0 ? (
        <EmptyState tr={tr} />
      ) : (
        <>
          {/* Progress */}
          <div
            className="mb-6 h-[3px] w-full overflow-hidden rounded-full"
            style={{ background: "var(--border)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${(done / total) * 100}%`,
                background: "var(--accent)",
                transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)",
              }}
            />
          </div>

          {/* Card */}
          <div
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className="mb-6 select-none"
            style={{
              transform:
                slide === "left"
                  ? "translateX(-90px)"
                  : slide === "right"
                  ? "translateX(90px)"
                  : "translateX(0)",
              opacity: slide ? 0 : 1,
              transition: slide
                ? "transform 0.28s cubic-bezier(0.4,0,1,1), opacity 0.22s ease"
                : "none",
            }}
          >
            {current && <ReviewCard entry={current} tr={tr} />}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => handleReview(false)}
              disabled={!!slide}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-4 font-sans text-sm font-medium transition-opacity active:opacity-70 disabled:opacity-40"
              style={{
                background: "var(--due-overdue-bg)",
                color: "var(--due-overdue)",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
              {tr.reviewAgain}
            </button>
            <button
              onClick={() => handleReview(true)}
              disabled={!!slide}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-4 font-sans text-sm font-medium transition-opacity active:opacity-70 disabled:opacity-40"
              style={{
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {tr.reviewGotIt}
            </button>
          </div>

          {/* Swipe hint */}
          <p
            className="mt-4 text-center font-sans text-[11px]"
            style={{ color: "var(--fg-muted)", opacity: 0.5 }}
          >
            ← {tr.reviewAgain} &nbsp;·&nbsp; {tr.reviewGotIt} →
          </p>
        </>
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ReviewCard({ entry, tr }: { entry: Entry; tr: ReturnType<typeof useT> }) {
  const label = contextLabel(entry.date, tr);

  return (
    <div
      className="fade-up rounded-3xl px-6 py-6"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Temporal context */}
      <span
        className="mb-4 inline-block rounded-full px-3 py-0.5 font-sans text-xs font-medium"
        style={{
          background: "var(--border)",
          color: "var(--fg-muted)",
          fontFamily: "var(--font-caveat), cursive",
          fontSize: "0.95rem",
        }}
      >
        {label}
      </span>

      {/* Content */}
      <p
        className="mb-4 font-serif leading-relaxed"
        style={{
          color: "var(--fg)",
          fontSize: "1rem",
          maxHeight: "40vh",
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {entry.content}
      </p>

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full px-2.5 py-0.5 font-sans text-[11px]"
              style={{
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ tr }: { tr: ReturnType<typeof useT> }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      <div
        className="mb-6 flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: "var(--accent-soft)" }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h3
        className="mb-2 text-2xl"
        style={{
          color: "var(--fg)",
          fontFamily: "var(--font-caveat), cursive",
          fontWeight: 500,
        }}
      >
        {tr.reviewEmpty}
      </h3>
      <p className="font-sans text-sm leading-relaxed" style={{ color: "var(--fg-muted)", maxWidth: 260 }}>
        {tr.reviewEmptyBody}
      </p>
    </div>
  );
}
