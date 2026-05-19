"use client";

import { useState, useEffect } from "react";
import { getDatesWithEntries, getEntriesByDate } from "@/lib/db";
import type { Entry } from "@/types/entry";
import { useSettings, locale } from "@/lib/settings-context";
import EntryCard from "./EntryCard";

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number, weekStart: "monday" | "sunday") {
  const day = new Date(year, month, 1).getDay();
  if (weekStart === "sunday") return day;
  return day === 0 ? 6 : day - 1;
}

export default function CalendarView() {
  const { settings } = useSettings();
  const loc = locale(settings);
  const todayDate = new Date();
  const [year, setYear] = useState(todayDate.getFullYear());
  const [month, setMonth] = useState(todayDate.getMonth());
  const [datesWithEntries, setDatesWithEntries] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [dayEntries, setDayEntries] = useState<Entry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const DAYS =
    settings.weekStart === "sunday"
      ? (settings.language === "de" ? ["So","Mo","Di","Mi","Do","Fr","Sa"] : ["Su","Mo","Tu","We","Th","Fr","Sa"])
      : (settings.language === "de" ? ["Mo","Di","Mi","Do","Fr","Sa","So"] : ["Mo","Tu","We","Th","Fr","Sa","Su"]);

  useEffect(() => {
    getDatesWithEntries().then(setDatesWithEntries);
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoadingEntries(true);
    getEntriesByDate(selected)
      .then(setDayEntries)
      .finally(() => setLoadingEntries(false));
  }, [selected]);

  function prev() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
    setSelected(null);
  }

  function next() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
    setSelected(null);
  }

  const totalDays = daysInMonth(year, month);
  const firstDay = firstDayOfMonth(year, month, settings.weekStart);
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const monthLabel = new Date(year, month, 1).toLocaleDateString(loc, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-[620px] px-4 pt-3">
      {/* Month navigation */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <button
          onClick={prev}
          className="btn-3d flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ color: "var(--fg-muted)" }}
          aria-label="Vorheriger Monat"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <h2
          className="flex-1 text-center font-serif text-xl font-normal"
          style={{ color: "var(--fg)" }}
        >
          {monthLabel}
        </h2>

        <button
          onClick={next}
          className="btn-3d flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ color: "var(--fg-muted)" }}
          aria-label="Nächster Monat"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="mb-2 grid grid-cols-7 gap-1.5">
        {DAYS.map((d) => (
          <div
            key={d}
            className="flex items-center justify-center py-1 font-sans text-[10px] font-medium uppercase tracking-wider"
            style={{ color: "var(--fg-muted)" }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid — extra padding-bottom so btn shadows aren't clipped */}
      <div
        className="grid grid-cols-7 gap-1.5 pb-2"
        style={{ gridAutoRows: "clamp(34px, min(7vw, 9vh), 52px)" }}
      >
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;

          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const hasEntry = datesWithEntries.has(dateStr);
          const isToday =
            day === todayDate.getDate() &&
            month === todayDate.getMonth() &&
            year === todayDate.getFullYear();
          const isSelected = selected === dateStr;

          return (
            <button
              key={day}
              data-active={isSelected || undefined}
              onClick={() => setSelected(isSelected ? null : dateStr)}
              className="btn-3d-subtle relative flex h-full w-full items-center justify-center rounded-xl font-sans text-sm"
              style={{
                color: isSelected
                  ? "var(--accent)"
                  : isToday
                  ? "var(--accent)"
                  : "var(--fg)",
                fontWeight: isToday || isSelected ? "600" : "400",
                outline: isToday && !isSelected
                  ? "2px solid var(--accent-soft)"
                  : undefined,
                outlineOffset: "-2px",
              }}
            >
              {day}
              {hasEntry && (
                <span
                  className="absolute bottom-[5px] left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full"
                  style={{
                    background: isSelected ? "var(--accent)" : "var(--accent-light)",
                    opacity: isSelected ? 1 : 0.7,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day entries */}
      {selected && (
        <div className="mt-5 fade-up">
          <p
            className="mb-3 font-sans text-xs font-medium uppercase tracking-[0.14em]"
            style={{ color: "var(--fg-muted)" }}
          >
            {new Date(selected + "T00:00:00").toLocaleDateString(loc, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>

          {loadingEntries ? (
            <div className="flex justify-center py-6">
              <div
                className="h-4 w-4 animate-spin rounded-full border-2"
                style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }}
              />
            </div>
          ) : dayEntries.length === 0 ? (
            <p
              className="py-4 text-center font-serif italic"
              style={{ color: "var(--fg-muted)" }}
            >
              Keine Einträge an diesem Tag.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {dayEntries.map((entry) => (
                <EntryCard key={entry._id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
