"use client";

import { useState } from "react";
import { isAuthenticated } from "@/lib/auth";
import { SettingsProvider } from "@/lib/settings-context";
import { useSyncStatus } from "@/lib/use-sync-status";
import { useConflictCount } from "@/lib/use-conflict-count";
import JournalView from "./JournalView";
import CalendarView from "./CalendarView";
import TodoView from "./TodoView";
import BottomNav from "./BottomNav";
import LockScreen from "./LockScreen";
import ProfileButton from "./ProfileButton";
import SettingsModal from "./SettingsModal";
import ConflictModal from "./ConflictModal";

function SyncDot() {
  const status = useSyncStatus();
  if (status === "idle") return null;

  const color =
    status === "error"   ? "oklch(55% 0.19 25)"  :
    status === "syncing" ? "oklch(62% 0.17 145)"  :
                           "oklch(62% 0.17 145)";

  return (
    <span
      title={status}
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        animation: status === "syncing" ? "pulse 1.2s ease-in-out infinite" : "none",
      }}
    />
  );
}

type View = "journal" | "calendar" | "todos";

export default function AppShell() {
  const [authed, setAuthed] = useState(() => isAuthenticated());

  if (!authed) {
    return (
      <SettingsProvider>
        <LockScreen onAuth={() => setAuthed(true)} />
      </SettingsProvider>
    );
  }

  return (
    <SettingsProvider>
      <AppContentWithLock onLock={() => setAuthed(false)} />
    </SettingsProvider>
  );
}

function AppContentWithLock({ onLock }: { onLock: () => void }) {
  const [view, setView] = useState<View>("journal");
  const [showSettings, setShowSettings] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const conflictCount = useConflictCount();

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)" }}>
      <header className="sticky top-0 z-40 flex items-center justify-between px-5 py-3" style={{ background: "var(--bg)" }}>
        <button
          onClick={() => setView("journal")}
          className="font-sans text-[11px] font-medium tracking-[0.2em] uppercase transition-opacity hover:opacity-60"
          style={{ color: "var(--fg-muted)" }}
        >
          gleaned
        </button>
        <div className="flex items-center gap-2.5">
          {conflictCount > 0 && (
            <button
              onClick={() => setShowConflicts(true)}
              title={`${conflictCount} Sync-Konflikt${conflictCount !== 1 ? "e" : ""}`}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs font-medium transition-opacity hover:opacity-80"
              style={{
                background: "color-mix(in oklch, oklch(72% 0.18 55), transparent 82%)",
                color: "oklch(62% 0.18 55)",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "oklch(72% 0.18 55)",
                  flexShrink: 0,
                }}
              />
              {conflictCount}
            </button>
          )}
          <SyncDot />
          <ProfileButton onLock={onLock} onSettings={() => setShowSettings(true)} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>
        {view === "journal"  && <JournalView />}
        {view === "calendar" && <CalendarView />}
        {view === "todos"    && <TodoView />}
      </main>

      <BottomNav current={view} onChange={setView} />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showConflicts && <ConflictModal onClose={() => setShowConflicts(false)} />}
    </div>
  );
}
