"use client";

import { useState, useEffect } from "react";
import { getEntriesByDate } from "@/lib/db";
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

export default function JournalView() {
  const { settings } = useSettings();
  const loc = locale(settings);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const today = todayDate();
  const { weekday, full } = formatDate(today, loc);

  useEffect(() => {
    getEntriesByDate(today).then(setEntries).finally(() => setLoading(false));
  }, [today]);

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
        <h1 className="font-serif text-[2.6rem] font-normal leading-none tracking-tight" style={{ color: "var(--fg)" }}>
          {weekday}
        </h1>
        <p className="mt-1.5 font-sans text-sm" style={{ color: "var(--fg-muted)" }}>
          {full}
        </p>
      </header>

      <div className="fade-up" style={{ animationDelay: "55ms" }}>
        <EntryForm onSaved={handleSaved} />
      </div>

      {!loading && entries.length > 0 && (
        <>
          <div className="my-7 flex items-center gap-4">
            <div className="h-px flex-1" style={{ background: "var(--border)" }} />
            <span className="font-sans text-[10px] font-medium tracking-[0.18em] uppercase" style={{ color: "var(--fg-muted)" }}>
              Heute · {entries.length}
            </span>
            <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          </div>
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <div key={entry._id} className={newIds.has(entry._id) ? "entry-appear" : ""}>
                <EntryCard entry={entry} onDelete={handleDelete} onUpdate={handleUpdate} />
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
