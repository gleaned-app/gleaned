"use client";

import { useState, useEffect } from "react";
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

type DeferredPrompt = { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function useInstallPrompt() {
  const [prompt, setPrompt] = useState<DeferredPrompt | null>(null);
  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault();
      setPrompt(e as unknown as DeferredPrompt);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setPrompt(null));
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);
  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setPrompt(null);
  }
  return { canInstall: !!prompt, install };
}

function AppContentWithLock({ onLock }: { onLock: () => void }) {
  const [view, setView] = useState<View>("journal");
  const [showSettings, setShowSettings] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const conflictCount = useConflictCount();
  const { canInstall, install } = useInstallPrompt();

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
          {canInstall && (
            <button
              onClick={install}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              title="App installieren"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Installieren
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
