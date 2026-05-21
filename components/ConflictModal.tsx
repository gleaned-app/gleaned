"use client";

import { useState, useEffect } from "react";
import { getConflicts, resolveConflict, type ConflictDoc } from "@/lib/db";
import type { Entry } from "@/types/entry";
import { useSettings, locale } from "@/lib/settings-context";
import { useT } from "@/lib/i18n";

function formatTs(iso: string, loc: string) {
  return new Date(iso).toLocaleString(loc, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function VersionCard({
  entry,
  label,
  onKeep,
  busy,
  loc,
  noContent,
  keepThis,
}: {
  entry: Entry;
  label: string;
  onKeep: () => void;
  busy: boolean;
  loc: string;
  noContent: string;
  keepThis: string;
}) {
  return (
    <div
      className="flex flex-col gap-2.5 rounded-xl p-3"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-sans text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--fg-muted)" }}
        >
          {label}
        </span>
        <span className="font-sans text-[10px]" style={{ color: "var(--fg-muted)" }}>
          {formatTs(entry.createdAt, loc)}
        </span>
      </div>

      <div
        className="max-h-36 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed"
        style={{ color: entry.content ? "var(--fg)" : "var(--fg-muted)" }}
      >
        {entry.content || noContent}
      </div>

      {entry.tags && entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((t) => (
            <span
              key={t}
              className="rounded-full px-2 py-0.5 font-sans text-[10px]"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={onKeep}
        disabled={busy}
        className="mt-auto w-full rounded-xl py-2 font-sans text-sm font-medium transition-opacity"
        style={{
          background: "var(--fg)",
          color: "var(--bg)",
          opacity: busy ? 0.55 : 1,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "…" : keepThis}
      </button>
    </div>
  );
}

interface Props {
  onClose: () => void;
}

export default function ConflictModal({ onClose }: Props) {
  const { settings } = useSettings();
  const t = useT();
  const loc = locale(settings);

  const [items, setItems] = useState<ConflictDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);

  function handleClose() {
    setClosing(true);
    setTimeout(onClose, 190);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getConflicts()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  const conflict = items[current];

  async function handleKeep(entry: Entry) {
    if (!conflict || busy) return;
    setBusy(true);
    try {
      const versions = [conflict.winner, ...conflict.alternatives];
      const allRevs = versions.map((v) => v._rev!);
      const discardRevs = allRevs.filter((r) => r !== entry._rev);
      await resolveConflict(conflict.winner._id, entry._rev!, discardRevs);
      const remaining = items.filter((_, i) => i !== current);
      setItems(remaining);
      if (remaining.length === 0) {
        onClose();
      } else {
        setCurrent((c) => Math.min(c, remaining.length - 1));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-50${closing ? " overlay-closing" : ""}`}
        style={{ background: "oklch(0% 0 0 / 0.5)" }}
        onClick={handleClose}
      />

      <div
        className={`${closing ? "modal-closing" : "scale-in"} fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-5
                   sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-[540px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:pb-6`}
        style={{
          background: "var(--bg-card)",
          boxShadow: "0 -4px 40px oklch(0% 0 0 / 0.25), var(--shadow-form)",
        }}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full sm:hidden"
          style={{ background: "var(--border-focus)" }}
        />

        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-normal" style={{ color: "var(--fg)" }}>
              {t.syncConflict}
            </h2>
            {items.length > 1 && (
              <p className="mt-0.5 font-sans text-xs" style={{ color: "var(--fg-muted)" }}>
                {current + 1} / {items.length}
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="btn-3d flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full font-sans text-base leading-none"
            style={{ color: "var(--fg-muted)" }}
            aria-label={t.close}
          >
            ×
          </button>
        </div>

        <p className="mb-4 font-sans text-sm" style={{ color: "var(--fg-muted)" }}>
          {t.conflictDesc}
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <div
              className="h-4 w-4 animate-spin rounded-full border-2"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }}
            />
          </div>
        ) : !conflict ? (
          <p className="py-6 text-center font-sans text-sm" style={{ color: "var(--fg-muted)" }}>
            {t.noConflicts}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[conflict.winner, ...conflict.alternatives].map((entry, i) => (
                <VersionCard
                  key={entry._rev ?? i}
                  entry={entry}
                  label={`Version ${String.fromCharCode(65 + i)}`}
                  onKeep={() => handleKeep(entry)}
                  busy={busy}
                  loc={loc}
                  noContent={t.noContent}
                  keepThis={t.keepThis}
                />
              ))}
            </div>

            {items.length > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                  disabled={current === 0}
                  className="btn-3d rounded-xl px-4 py-2 font-sans text-sm"
                  style={{ color: "var(--fg-muted)", opacity: current === 0 ? 0.3 : 1 }}
                >
                  ←
                </button>
                <span className="font-sans text-xs" style={{ color: "var(--fg-muted)" }}>
                  {current + 1} / {items.length}
                </span>
                <button
                  onClick={() => setCurrent((c) => Math.min(items.length - 1, c + 1))}
                  disabled={current === items.length - 1}
                  className="btn-3d rounded-xl px-4 py-2 font-sans text-sm"
                  style={{ color: "var(--fg-muted)", opacity: current === items.length - 1 ? 0.3 : 1 }}
                >
                  →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
