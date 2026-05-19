"use client";

import { useState, useEffect } from "react";
import { isAuthenticated } from "@/lib/auth";
import { SettingsProvider } from "@/lib/settings-context";
import JournalView from "./JournalView";
import CalendarView from "./CalendarView";
import TodoView from "./TodoView";
import BottomNav from "./BottomNav";
import LockScreen from "./LockScreen";
import ProfileButton from "./ProfileButton";
import SettingsModal from "./SettingsModal";

type View = "journal" | "calendar" | "todos";

export default function AppShell() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    isAuthenticated().then(setAuthed);
  }, []);

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="h-5 w-5 animate-spin rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

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
        <ProfileButton onLock={onLock} onSettings={() => setShowSettings(true)} />
      </header>

      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>
        {view === "journal"  && <JournalView />}
        {view === "calendar" && <CalendarView />}
        {view === "todos"    && <TodoView />}
      </main>

      <BottomNav current={view} onChange={setView} />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
