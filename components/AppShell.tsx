"use client";

import { useState, useEffect, useRef } from "react";
import { isAuthenticated, logout } from "@/lib/auth";
import { SettingsProvider } from "@/lib/settings-context";
import { useSyncStatus } from "@/lib/use-sync-status";
import { useConflictCount } from "@/lib/use-conflict-count";
import { useT } from "@/lib/i18n";
import JournalView from "./JournalView";
import CalendarView from "./CalendarView";
import TodoView from "./TodoView";
import ReviewView from "./ReviewView";
import BottomNav, { type View } from "./BottomNav";
import { getReviewCount } from "@/lib/db";
import LockScreen from "./LockScreen";
import ProfileButton from "./ProfileButton";
import SettingsModal from "./SettingsModal";
import ConflictModal from "./ConflictModal";
import SearchModal from "./SearchModal";
import ErrorBoundary from "./ErrorBoundary";

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
  const [calendarJumpDate, setCalendarJumpDate] = useState<string | undefined>();
  const [showSettings, setShowSettings] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const conflictCount = useConflictCount();
  const { canInstall, install } = useInstallPrompt();
  const t = useT();
  const mainRef = useRef<HTMLElement>(null);
  // Lazy-mount: View bleibt im DOM sobald sie einmal besucht wurde → kein Skeleton-Flash bei Rückkehr
  const [visited, setVisited] = useState<Set<View>>(new Set([view]));

  useEffect(() => {
    getReviewCount().then(setReviewCount);
  }, []);

  function mount(v: View) {
    setVisited((prev) => { const s = new Set(prev); s.add(v); return s; });
  }

  // Nav-tab click: gleichen Tab → scroll nach oben; anderer Tab → wechseln
  function handleViewChange(v: View) {
    if (v === view) {
      mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    mount(v);
    setCalendarJumpDate(undefined);
    if (view === "review" && v !== "review") getReviewCount().then(setReviewCount);
    setView(v);
  }

  // Programmatic navigation (e.g. from Review → Calendar with a specific date)
  function handleNavigate(v: View, date?: string) {
    mount(v);
    setCalendarJumpDate(date);
    setView(v);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        logout();
        onLock();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onLock]);

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)" }}>
      <header className="sticky top-0 z-40 flex items-center justify-between px-5 py-3" style={{ background: "var(--bg)" }}>
        <button
          onClick={() => handleViewChange("journal")}
          className="font-sans text-[11px] font-medium tracking-[0.2em] uppercase transition-opacity hover:opacity-60"
          style={{ color: "var(--fg-muted)" }}
        >
          gleaned
        </button>
        <div className="flex items-center gap-2.5">
          {conflictCount > 0 && (
            <button
              onClick={() => setShowConflicts(true)}
              title={t.syncConflicts(conflictCount)}
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
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {t.install}
            </button>
          )}
          <button
            onClick={() => setShowSearch(true)}
            className="btn-3d flex h-8 w-8 items-center justify-center rounded-full"
            style={{ color: "var(--fg-muted)" }}
            aria-label={t.search}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
          <SyncDot />
          <ProfileButton onLock={onLock} onSettings={() => setShowSettings(true)} />
        </div>
      </header>

      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto"
        style={{
          paddingBottom: "calc(80px + env(safe-area-inset-bottom))",
          overscrollBehavior: "contain",
        }}
      >
        {/* Views bleiben im DOM sobald erstmalig besucht — kein Re-fetch, kein Skeleton-Flash */}
        <div style={{ display: view === "journal" ? "block" : "none" }}>
          {visited.has("journal") && <ErrorBoundary key="journal"><JournalView /></ErrorBoundary>}
        </div>
        <div style={{ display: view === "calendar" ? "block" : "none" }}>
          {visited.has("calendar") && (
            <ErrorBoundary key="calendar">
              <CalendarView key={calendarJumpDate ?? "cal"} initialDate={calendarJumpDate} />
            </ErrorBoundary>
          )}
        </div>
        <div style={{ display: view === "todos" ? "block" : "none" }}>
          {visited.has("todos") && <ErrorBoundary key="todos"><TodoView /></ErrorBoundary>}
        </div>
        <div style={{ display: view === "review" ? "block" : "none" }}>
          {visited.has("review") && <ErrorBoundary key="review"><ReviewView onCountChange={setReviewCount} onNavigate={handleNavigate} /></ErrorBoundary>}
        </div>
      </main>

      <BottomNav current={view} onChange={handleViewChange} reviewCount={reviewCount} />

      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showConflicts && <ConflictModal onClose={() => setShowConflicts(false)} />}
    </div>
  );
}
