"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  getThreads,
  saveThread,
  updateThreadDoc,
  updateThreadText,
  updateThreadDueDate,
  updateThreadColor,
  updateThreadNotes,
  deleteThread,
  toLocalDateStr,
} from "@/lib/db";
import type { Thread } from "@/types/thread";
import { useT, type Translations } from "@/lib/i18n";
import { useSettings, locale } from "@/lib/settings-context";
import { renderNotesMarkdown } from "@/lib/markdown";

// ─── Colors ───────────────────────────────────────────────────────────────────

const THREAD_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
] as const;

// ─── Date helpers ─────────────────────────────────────────────────────────────

function today(): string {
  return toLocalDateStr();
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalDateStr(d);
}

type DueStatus = "overdue" | "today" | "soon" | "future";

function getDueInfo(
  dueDate: string,
  tr: Translations,
  loc: string
): { label: string; status: DueStatus } {
  const t = today();
  const tom = tomorrow();
  if (dueDate < t) {
    const diff = Math.round(
      (new Date(t).getTime() - new Date(dueDate).getTime()) / 86_400_000
    );
    return {
      label: diff === 1 ? tr.yesterday : tr.overdue(diff),
      status: "overdue",
    };
  }
  if (dueDate === t) return { label: tr.today, status: "today" };
  if (dueDate === tom) return { label: tr.tomorrow, status: "soon" };
  const d = new Date(dueDate + "T00:00:00");
  return {
    label: d.toLocaleDateString(loc, { day: "numeric", month: "short" }),
    status: "future",
  };
}

const STATUS_COLOR: Record<DueStatus, { fg: string; bg: string }> = {
  overdue: { fg: "var(--due-overdue)", bg: "var(--due-overdue-bg)" },
  today:   { fg: "var(--due-today)",   bg: "var(--due-today-bg)"  },
  soon:    { fg: "var(--due-soon)",    bg: "var(--due-soon-bg)"   },
  future:  { fg: "var(--fg-muted)",    bg: "var(--border)"        },
};

function sortOpen(threads: Thread[]): Thread[] {
  const t = today();
  const rank = (thread: Thread): number => {
    if (!thread.dueDate) return 4;
    if (thread.dueDate < t) return 0;
    if (thread.dueDate === t) return 1;
    return 2;
  };
  return [...threads].sort((a, b) => {
    const dr = rank(a) - rank(b);
    if (dr !== 0) return dr;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function ThreadsView() {
  const t = useT();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [input, setInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [color, setColor] = useState("");
  const [showPanel, setShowPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getThreads().then(setThreads).finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    const savedDue = dueDate;
    const savedColor = color;
    setInput("");
    setDueDate("");
    setColor("");
    setShowPanel(false);
    inputRef.current?.focus();
    try {
      const thread = await saveThread(text, savedDue || undefined, savedColor || undefined);
      setThreads((prev) => [thread, ...prev]);
    } catch {
      setInput(text);
      setDueDate(savedDue);
      setColor(savedColor);
    }
  }

  const handleToggle = useCallback(async (thread: Thread) => {
    setThreads((prev) =>
      prev.map((t) => (t._id === thread._id ? { ...t, done: !t.done } : t))
    );
    try {
      const updated = await updateThreadDoc(thread);
      setThreads((prev) =>
        prev.map((t) => (t._id === updated._id ? updated : t))
      );
    } catch {
      getThreads().then(setThreads);
    }
  }, []);

  const handleUpdateText = useCallback(async (thread: Thread, text: string) => {
    setThreads((prev) =>
      prev.map((t) => (t._id === thread._id ? { ...t, text } : t))
    );
    try {
      const updated = await updateThreadText(thread, text);
      setThreads((prev) =>
        prev.map((t) => (t._id === updated._id ? updated : t))
      );
    } catch {
      getThreads().then(setThreads);
    }
  }, []);

  const handleUpdateDueDate = useCallback(
    async (thread: Thread, dueDate: string | undefined) => {
      setThreads((prev) =>
        prev.map((t) =>
          t._id === thread._id ? { ...t, dueDate: dueDate ?? undefined } : t
        )
      );
      try {
        const updated = await updateThreadDueDate(thread, dueDate);
        setThreads((prev) =>
          prev.map((t) => (t._id === updated._id ? updated : t))
        );
      } catch {
        getThreads().then(setThreads);
      }
    },
    []
  );

  const handleUpdateColor = useCallback(
    async (thread: Thread, color: string | undefined) => {
      setThreads((prev) =>
        prev.map((t) =>
          t._id === thread._id ? { ...t, color: color ?? undefined } : t
        )
      );
      try {
        const updated = await updateThreadColor(thread, color);
        setThreads((prev) =>
          prev.map((t) => (t._id === updated._id ? updated : t))
        );
      } catch {
        getThreads().then(setThreads);
      }
    },
    []
  );

  const handleUpdateNotes = useCallback(
    async (thread: Thread, notes: string | undefined) => {
      setThreads((prev) =>
        prev.map((t) =>
          t._id === thread._id ? { ...t, notes: notes ?? undefined } : t
        )
      );
      try {
        const updated = await updateThreadNotes(thread, notes);
        setThreads((prev) =>
          prev.map((t) => (t._id === updated._id ? updated : t))
        );
      } catch {
        getThreads().then(setThreads);
      }
    },
    []
  );

  const handleDelete = useCallback(async (id: string) => {
    setThreads((prev) => prev.filter((t) => t._id !== id));
    try {
      await deleteThread(id);
    } catch {
      getThreads().then(setThreads);
    }
  }, []);

  const open = sortOpen(threads.filter((t) => !t.done));
  const done = threads.filter((t) => t.done);
  const total = threads.length;
  const pct = total > 0 ? done.length / total : 0;
  const hasOverdue = open.some((t) => t.dueDate && t.dueDate < today());

  return (
    <div className="mx-auto max-w-[620px] px-5 pt-6 pb-10">
      {/* Header */}
      <div className="mb-4 flex items-baseline justify-between">
        <h2
          className="text-2xl font-normal"
          style={{
            color: "var(--fg)",
            fontFamily: "var(--font-caveat), cursive",
            fontWeight: 500,
          }}
        >
          {t.threadsTitle}
        </h2>
        {total > 0 && (
          <span
            className="font-sans text-xs tabular-nums"
            style={{ color: "var(--fg-muted)" }}
          >
            {done.length}&thinsp;/&thinsp;{total}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div
        className="mb-5 h-[3px] w-full overflow-hidden rounded-full"
        style={{ background: total > 0 ? "var(--border)" : "transparent" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct * 100}%`,
            background: hasOverdue ? "var(--due-overdue)" : "var(--accent)",
            transition:
              "width 0.5s cubic-bezier(0.16,1,0.3,1), background 0.4s ease",
          }}
        />
      </div>

      {/* Input form */}
      <form onSubmit={handleAdd} className="mb-6">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.threadsPlaceholder}
            autoFocus
            className="journal-input flex-1 rounded-2xl px-4 py-3 font-sans text-sm outline-none"
            style={{
              background: "var(--bg-card)",
              color: "var(--fg)",
              boxShadow: input ? "var(--shadow-form)" : "var(--shadow-card)",
              border: "1px solid var(--border)",
              transition: "box-shadow 200ms ease",
            }}
          />

          {/* Options toggle */}
          <button
            type="button"
            onClick={() => setShowPanel((v) => !v)}
            data-active={showPanel ? "true" : undefined}
            title={t.setDueDate}
            className="btn-3d relative flex flex-shrink-0 items-center justify-center rounded-2xl px-3.5 py-3"
            style={{
              color: dueDate || color ? "var(--accent)" : "var(--fg-muted)",
              transition: "color 150ms ease",
            }}
          >
            {color && (
              <span
                className="absolute right-2 top-2 block h-2 w-2 rounded-full"
                style={{ background: color }}
              />
            )}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="3" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>

          {/* Add */}
          <button
            type="submit"
            disabled={!input.trim()}
            className="btn-3d rounded-2xl px-5 py-3 font-sans text-lg leading-none"
            style={{
              color: "var(--accent)",
              opacity: input.trim() ? 1 : 0.38,
              transition: "opacity 150ms ease",
            }}
          >
            +
          </button>
        </div>

        {/* Options panel (date + color) */}
        {showPanel && (
          <div
            className="mt-2 flex flex-col gap-3 rounded-2xl px-4 py-3"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-card)",
              animation: "thread-in 0.2s cubic-bezier(0.16,1,0.3,1) both",
            }}
          >
            {/* Date row */}
            <div className="flex flex-wrap items-center gap-2">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: "var(--fg-muted)", flexShrink: 0 }}
              >
                <rect x="3" y="4" width="18" height="18" rx="3" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <button
                type="button"
                onClick={() =>
                  setDueDate(dueDate === today() ? "" : today())
                }
                className="rounded-full px-3 py-1 font-sans text-xs font-medium transition-opacity hover:opacity-80"
                style={{
                  background:
                    dueDate === today()
                      ? "var(--accent-soft)"
                      : "var(--border)",
                  color:
                    dueDate === today()
                      ? "var(--accent)"
                      : "var(--fg-muted)",
                }}
              >
                {t.today}
              </button>
              <button
                type="button"
                onClick={() =>
                  setDueDate(dueDate === tomorrow() ? "" : tomorrow())
                }
                className="rounded-full px-3 py-1 font-sans text-xs font-medium transition-opacity hover:opacity-80"
                style={{
                  background:
                    dueDate === tomorrow()
                      ? "var(--accent-soft)"
                      : "var(--border)",
                  color:
                    dueDate === tomorrow()
                      ? "var(--accent)"
                      : "var(--fg-muted)",
                }}
              >
                {t.tomorrow}
              </button>
              <input
                type="date"
                value={dueDate}
                min={today()}
                onChange={(e) => setDueDate(e.target.value)}
                className="min-w-[110px] flex-1 rounded-xl px-3 py-1 font-sans text-xs outline-none"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: dueDate ? "var(--fg)" : "var(--fg-placeholder)",
                }}
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate("")}
                  className="font-sans text-xs transition-opacity hover:opacity-60"
                  style={{ color: "var(--fg-muted)" }}
                >
                  {t.remove}
                </button>
              )}
            </div>

            {/* Color row */}
            <div className="flex items-center gap-2.5">
              <span
                className="flex-shrink-0 font-sans text-xs"
                style={{ color: "var(--fg-muted)" }}
              >
                {t.color}:
              </span>
              <div className="flex items-center gap-2">
                {THREAD_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(color === c ? "" : c)}
                    className="h-6 w-6 rounded-full transition-transform hover:scale-110 active:scale-95"
                    style={{
                      background: c,
                      boxShadow:
                        color === c
                          ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}`
                          : "none",
                    }}
                    aria-label={c}
                  />
                ))}
                {color && (
                  <button
                    type="button"
                    onClick={() => setColor("")}
                    className="flex h-6 w-6 items-center justify-center rounded-full border transition-opacity hover:opacity-60"
                    style={{
                      borderColor: "var(--border-focus)",
                      color: "var(--fg-muted)",
                      fontSize: "9px",
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </form>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-14">
          <span
            className="h-5 w-5 animate-spin rounded-full border-2"
            style={{
              borderColor: "var(--border)",
              borderTopColor: "var(--accent)",
            }}
          />
        </div>
      ) : total === 0 ? (
        <p
          className="py-16 text-center font-serif italic"
          style={{ color: "var(--fg-muted)" }}
        >
          {t.threadsEmpty}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {open.map((thread, i) => (
              <ThreadItem
                key={thread._id}
                thread={thread}
                index={i}
                onToggle={handleToggle}
                onUpdateText={handleUpdateText}
                onUpdateDueDate={handleUpdateDueDate}
                onUpdateColor={handleUpdateColor}
                onUpdateNotes={handleUpdateNotes}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {done.length > 0 && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div
                  className="h-px flex-1"
                  style={{ background: "var(--border)" }}
                />
                <span
                  className="font-sans text-[10px] font-medium uppercase tracking-[0.16em]"
                  style={{ color: "var(--fg-muted)" }}
                >
                  {t.done} · {done.length}
                </span>
                <div
                  className="h-px flex-1"
                  style={{ background: "var(--border)" }}
                />
              </div>
              <div className="flex flex-col gap-2">
                {done.map((thread, i) => (
                  <ThreadItem
                    key={thread._id}
                    thread={thread}
                    index={i}
                    onToggle={handleToggle}
                    onUpdateText={handleUpdateText}
                    onUpdateDueDate={handleUpdateDueDate}
                    onUpdateColor={handleUpdateColor}
                    onUpdateNotes={handleUpdateNotes}
                    onDelete={handleDelete}
                    dimmed
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Thread item ──────────────────────────────────────────────────────────────

// Toggles the nth `- [ ]` / `- [x]` occurrence in a markdown string.
function toggleNthCheckbox(markdown: string, index: number): string {
  let count = 0;
  return markdown.replace(/- \[([ xX])\]/g, (match, state) => {
    if (count++ === index) return state === " " ? "- [x]" : "- [ ]";
    return match;
  });
}

type OpenPanel = "date" | "color" | null;

const ThreadItem = memo(function ThreadItem({
  thread,
  index,
  onToggle,
  onUpdateText,
  onUpdateDueDate,
  onUpdateColor,
  onUpdateNotes,
  onDelete,
  dimmed = false,
}: {
  thread: Thread;
  index: number;
  onToggle: (t: Thread) => void;
  onUpdateText: (t: Thread, text: string) => void;
  onUpdateDueDate: (t: Thread, dueDate: string | undefined) => void;
  onUpdateColor: (t: Thread, color: string | undefined) => void;
  onUpdateNotes: (t: Thread, notes: string | undefined) => void;
  onDelete: (id: string) => void;
  dimmed?: boolean;
}) {
  const tr = useT();
  const { settings } = useSettings();
  const loc = locale(settings);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(thread.text);
  const [popping, setPopping] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [expanded, setExpanded] = useState(false);
  const [notesMode, setNotesMode] = useState<"edit" | "preview">("edit");
  const [notesVal, setNotesVal] = useState(thread.notes ?? "");
  const editRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  // Keep local notes in sync if the parent updates the thread (e.g. optimistic revert).
  useEffect(() => {
    setNotesVal(thread.notes ?? "");
  }, [thread.notes]);


  useEffect(() => {
    if (editing) {
      setVal(thread.text);
      requestAnimationFrame(() => editRef.current?.select());
    }
  }, [editing, thread.text]);

  // Close panel when clicking/touching outside this item
  useEffect(() => {
    if (!openPanel) return;
    function close(e: MouseEvent | TouchEvent) {
      if (!itemRef.current?.contains(e.target as Node)) setOpenPanel(null);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close, { passive: true });
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [openPanel]);

  function commit() {
    setEditing(false);
    const trimmed = val.trim();
    if (trimmed && trimmed !== thread.text) onUpdateText(thread, trimmed);
    else setVal(thread.text);
  }

  function commitNotes() {
    const v = notesVal.trim();
    onUpdateNotes(thread, v || undefined);
  }

  function handleCheckboxClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName !== "INPUT" || target.getAttribute("type") !== "checkbox") return;
    e.preventDefault();
    const boxes = e.currentTarget.querySelectorAll('input[type="checkbox"]');
    const idx = Array.from(boxes).indexOf(target as HTMLInputElement);
    if (idx === -1) return;
    const updated = toggleNthCheckbox(notesVal, idx);
    setNotesVal(updated);
    onUpdateNotes(thread, updated || undefined);
  }

  function handleToggleClick() {
    setPopping(true);
    setOpenPanel(null);
    onToggle(thread);
  }

  function togglePanel(panel: Exclude<OpenPanel, null>) {
    if (thread.done) return;
    setOpenPanel((p) => (p === panel ? null : panel));
  }

  const dueInfo =
    thread.dueDate && !thread.done ? getDueInfo(thread.dueDate, tr, loc) : null;
  const dueColors = dueInfo ? STATUS_COLOR[dueInfo.status] : null;

  const leftAccent = thread.color
    ? `var(--shadow-card), inset 3px 0 0 ${thread.color}`
    : dueInfo?.status === "overdue"
    ? `var(--shadow-card), inset 3px 0 0 var(--due-overdue)`
    : "var(--shadow-card)";

  return (
    <div ref={itemRef} className="flex flex-col gap-1">
      {/* Main row */}
      <div
        className={`thread-appear group flex items-center gap-2.5 rounded-2xl px-3.5 py-[13px]`}
        style={{
          background: "var(--bg-card)",
          boxShadow: leftAccent,
          border: "1px solid var(--border)",
          opacity: dimmed ? 0.48 : 1,
          transition: "opacity 300ms ease, box-shadow 300ms ease",
          animationDelay: `${Math.min(index * 30, 180)}ms`,
        }}
      >
        {/* Color dot — opens color picker */}
        <button
          onClick={() => togglePanel("color")}
          aria-label={tr.color}
          className="flex-shrink-0 transition-transform hover:scale-110 active:scale-95"
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: thread.color || "transparent",
            border: thread.color
              ? `2.5px solid ${thread.color}`
              : "2px dashed var(--border-focus)",
            opacity: thread.done ? 0.25 : 0.7,
            cursor: thread.done ? "default" : "pointer",
            flexShrink: 0,
          }}
        />

        {/* Checkbox */}
        <button
          onClick={handleToggleClick}
          onAnimationEnd={() => setPopping(false)}
          className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200${popping ? " check-pop" : ""}`}
          style={{
            borderColor: thread.done ? "var(--accent)" : "var(--border-focus)",
            background: thread.done ? "var(--accent)" : "transparent",
            color: "var(--bg)",
          }}
          aria-label={thread.done ? tr.markOpen : tr.markDone}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              opacity: thread.done ? 1 : 0,
              transition: "opacity 120ms ease",
            }}
          >
            <polyline points="2 6 5 9 10 3" />
          </svg>
        </button>

        {/* Text */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {editing ? (
            <input
              ref={editRef}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commit(); }
                if (e.key === "Escape") { setEditing(false); setVal(thread.text); }
              }}
              className="bg-transparent font-sans text-sm leading-relaxed outline-none"
              style={{ color: "var(--fg)" }}
            />
          ) : (
            <span
              onClick={() => !thread.done && setEditing(true)}
              className={`font-sans text-sm leading-relaxed${expanded ? "" : " truncate"}`}
              style={{
                color: "var(--fg)",
                textDecorationLine: thread.done ? "line-through" : "none",
                textDecorationColor: "var(--fg-muted)",
                opacity: thread.done ? 0.55 : 1,
                cursor: thread.done ? "default" : "text",
                transition: "opacity 200ms ease",
                wordBreak: expanded ? "break-word" : undefined,
              }}
            >
              {thread.text}
            </span>
          )}
        </div>

        {/* Date chip (existing) or calendar icon (add date) */}
        {!thread.done && (
          dueInfo && dueColors ? (
            <button
              onClick={() => togglePanel("date")}
              className="flex-shrink-0 rounded-full px-2 py-0.5 font-sans text-[11px] font-medium transition-opacity hover:opacity-80 active:opacity-60"
              style={{
                color: dueColors.fg,
                background: dueColors.bg,
                whiteSpace: "nowrap",
              }}
              title={tr.setDueDate}
            >
              {dueInfo.label}
            </button>
          ) : (
            <button
              onClick={() => togglePanel("date")}
              className="flex-shrink-0 rounded-full p-1.5 transition-opacity"
              style={{
                color: "var(--fg-muted)",
                opacity: openPanel === "date" ? 0.7 : 0.25,
              }}
              title={tr.setDueDate}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="3" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
          )
        )}

        {/* Expand / Collapse chevron */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="relative flex-shrink-0 rounded-md p-1 transition-opacity"
          style={{
            color: "var(--fg-muted)",
            opacity: expanded ? 0.7 : notesVal ? 0.6 : 0.42,
          }}
          aria-label={expanded ? "Einklappen" : "Ausklappen"}
        >
          {notesVal && !expanded && (
            <span
              className="absolute right-0.5 top-0.5 block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--accent)" }}
            />
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 220ms cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Delete / Confirmation */}
        {pendingDelete ? (
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              onClick={() => onDelete(thread._id)}
              className="rounded-lg px-2 py-0.5 font-sans text-[11px] font-medium transition-opacity hover:opacity-80"
              style={{
                background: "var(--due-overdue-bg)",
                color: "var(--due-overdue)",
              }}
            >
              {tr.delete}
            </button>
            <button
              onClick={() => setPendingDelete(false)}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-sm transition-opacity hover:opacity-60"
              style={{ color: "var(--fg-muted)" }}
              aria-label={tr.cancel}
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setPendingDelete(true)}
            className="flex-shrink-0 rounded-md p-0.5 opacity-[0.2] transition-opacity hover:opacity-65 active:opacity-100"
            style={{ color: "var(--fg)" }}
            aria-label={tr.delete}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Inline panel — date or color picker */}
      {openPanel && !thread.done && (
        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-card)",
            animation: "thread-in 0.18s cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          {openPanel === "color" && (
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className="flex-shrink-0 font-sans text-xs"
                style={{ color: "var(--fg-muted)" }}
              >
                {tr.color}:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {THREAD_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      onUpdateColor(thread, thread.color === c ? undefined : c);
                      setOpenPanel(null);
                    }}
                    className="h-9 w-9 rounded-full transition-transform hover:scale-110 active:scale-95"
                    style={{
                      background: c,
                      boxShadow:
                        thread.color === c
                          ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}`
                          : "none",
                    }}
                    aria-label={c}
                  />
                ))}
                {thread.color && (
                  <button
                    onClick={() => {
                      onUpdateColor(thread, undefined);
                      setOpenPanel(null);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full border transition-opacity hover:opacity-60"
                    style={{
                      borderColor: "var(--border-focus)",
                      color: "var(--fg-muted)",
                      fontSize: "9px",
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {openPanel === "date" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  onUpdateDueDate(thread, today());
                  setOpenPanel(null);
                }}
                className="rounded-full px-3 py-1.5 font-sans text-xs font-medium transition-opacity hover:opacity-80 active:opacity-60"
                style={{
                  background:
                    thread.dueDate === today()
                      ? "var(--accent-soft)"
                      : "var(--border)",
                  color:
                    thread.dueDate === today()
                      ? "var(--accent)"
                      : "var(--fg-muted)",
                }}
              >
                {tr.today}
              </button>
              <button
                onClick={() => {
                  onUpdateDueDate(thread, tomorrow());
                  setOpenPanel(null);
                }}
                className="rounded-full px-3 py-1.5 font-sans text-xs font-medium transition-opacity hover:opacity-80 active:opacity-60"
                style={{
                  background:
                    thread.dueDate === tomorrow()
                      ? "var(--accent-soft)"
                      : "var(--border)",
                  color:
                    thread.dueDate === tomorrow()
                      ? "var(--accent)"
                      : "var(--fg-muted)",
                }}
              >
                {tr.tomorrow}
              </button>
              {/* Visible date input — works natively on iOS/Android PWA */}
              <input
                type="date"
                value={thread.dueDate ?? ""}
                onChange={(e) => {
                  if (e.target.value) {
                    onUpdateDueDate(thread, e.target.value);
                    setOpenPanel(null);
                  }
                }}
                className="min-w-[110px] flex-1 rounded-xl px-3 py-1.5 font-sans text-xs outline-none"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: thread.dueDate ? "var(--fg)" : "var(--fg-placeholder)",
                }}
              />
              {thread.dueDate && (
                <button
                  onClick={() => {
                    onUpdateDueDate(thread, undefined);
                    setOpenPanel(null);
                  }}
                  className="rounded-full px-3 py-1.5 font-sans text-xs transition-opacity hover:opacity-60 active:opacity-40"
                  style={{ color: "var(--fg-muted)" }}
                >
                  {tr.remove}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expanded notes section */}
      {expanded && (
        <div
          className="rounded-2xl px-4 pb-3 pt-2"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-card)",
            animation: "thread-in 0.2s cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          {/* Edit / Preview tabs */}
          <div className="mb-2.5 flex gap-1">
            {(["edit", "preview"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (mode === "preview") commitNotes();
                  setNotesMode(mode);
                  if (mode === "edit") requestAnimationFrame(() => notesRef.current?.focus());
                }}
                className="rounded-lg px-2.5 py-0.5 font-sans text-[11px] font-medium transition-all"
                style={{
                  background: notesMode === mode ? "var(--accent-soft)" : "transparent",
                  color: notesMode === mode ? "var(--accent)" : "var(--fg-muted)",
                }}
              >
                {mode === "edit" ? "✏ Bearbeiten" : "👁 Vorschau"}
              </button>
            ))}
          </div>

          {notesMode === "edit" ? (
            <textarea
              ref={notesRef}
              value={notesVal}
              onChange={(e) => setNotesVal(e.target.value)}
              onBlur={commitNotes}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); commitNotes(); }
              }}
              placeholder={tr.threadNotesPlaceholder}
              rows={Math.max(3, (notesVal.match(/\n/g)?.length ?? 0) + 2)}
              className="w-full resize-none bg-transparent font-sans text-sm leading-relaxed outline-none placeholder:text-[color:var(--fg-placeholder)]"
              style={{ color: "var(--fg)" }}
              autoFocus
            />
          ) : notesVal ? (
            <div
              className="notes-rendered font-sans text-sm leading-relaxed"
              style={{ color: "var(--fg)", minHeight: "3rem" }}
              onClick={handleCheckboxClick}
              dangerouslySetInnerHTML={{ __html: renderNotesMarkdown(notesVal) }}
            />
          ) : (
            <p
              className="font-sans text-sm italic"
              style={{ color: "var(--fg-muted)", minHeight: "3rem" }}
            >
              {tr.threadNotesPlaceholder}
            </p>
          )}
        </div>
      )}
    </div>
  );
});
