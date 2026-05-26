"use client";

import { useState, useEffect, useRef } from "react";
import { isAuthenticated, logout } from "@/lib/auth";
import { SettingsProvider } from "@/lib/settings-context";
import { useSyncStatus } from "@/lib/use-sync-status";
import { useConflictCount } from "@/lib/use-conflict-count";
import { useT } from "@/lib/i18n";
import JournalView from "./JournalView";
import CalendarView from "./CalendarView";
import ThreadsView from "./ThreadsView";
import ReviewView from "./ReviewView";
import BottomNav, { type View } from "./BottomNav";
import { getReviewCount } from "@/lib/db";
import LockScreen from "./LockScreen";
import ProfileButton from "./ProfileButton";
import SettingsModal from "./SettingsModal";
import ConflictModal from "./ConflictModal";
import SearchModal from "./SearchModal";
import ErrorBoundary from "./ErrorBoundary";
import SWUpdatePrompt from "./SWUpdatePrompt";

function SyncDot() {
  const status = useSyncStatus();
  const t = useT();
  if (status === "idle") return null;

  const color =
    status === "error"   ? "oklch(55% 0.19 25)" :
    status === "syncing" ? "oklch(62% 0.17 145)" :
                           "oklch(62% 0.17 145)";

  const label =
    status === "error"   ? t.syncStatusError :
    status === "syncing" ? t.syncStatusSyncing :
                           t.syncStatusSynced;

  return (
    <span
      title={label}
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        cursor: "default",
        animation: status === "syncing" ? "pulse 1.2s ease-in-out infinite" : "none",
      }}
    />
  );
}

export default function AppShell() {
  const [authed, setAuthed] = useState(() => isAuthenticated());

  if (!authed) {
    return (
      <SettingsProvider key="locked">
        <LockScreen onAuth={() => setAuthed(true)} />
      </SettingsProvider>
    );
  }

  return (
    <SettingsProvider key="authed">
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
    function onInstalled() { setPrompt(null); }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
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

const VIEWS: View[] = ["journal", "calendar", "threads", "review"];

function AppContentWithLock({ onLock }: { onLock: () => void }) {
  const [view, setView] = useState<View>(() => {
    try {
      const saved = localStorage.getItem("gleaned-view") as View;
      if (VIEWS.includes(saved)) return saved;
    } catch {}
    return "journal";
  });
  const [calendarJumpDate, setCalendarJumpDate] = useState<string | undefined>();
  const [showSettings, setShowSettings] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [entryVersion, setEntryVersion] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const conflictCount = useConflictCount();
  const { canInstall, install } = useInstallPrompt();
  const t = useT();
  const mainRef = useRef<HTMLElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const viewRef = useRef<View>(view);
  // Lazy-mount: View bleibt im DOM sobald sie einmal besucht wurde → kein Skeleton-Flash bei Rückkehr
  const [visited, setVisited] = useState<Set<View>>(new Set([view]));

  useEffect(() => {
    getReviewCount().then(setReviewCount);
  }, [entryVersion]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") getReviewCount().then(setReviewCount);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);

  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [view]);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 4);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Passive touch listeners — React's onTouchStart/End sind non-passive und blockieren
  // Chromes Compositor-Scroll. Passive Listener lassen den Compositor scrollen ohne zu warten.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    function onStart(e: TouchEvent) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    }
    function onEnd(e: TouchEvent) {
      const v = viewRef.current;
      if (v === "review") return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      const idx = VIEWS.indexOf(v);
      let next: View | null = null;
      if (dx < 0 && idx < VIEWS.length - 1) next = VIEWS[idx + 1];
      if (dx > 0 && idx > 0) next = VIEWS[idx - 1];
      if (!next) return;
      setVisited(prev => { const s = new Set(prev); s.add(next!); return s; });
      setCalendarJumpDate(undefined);
      mainRef.current?.scrollTo({ top: 0 });
      setView(next);
    }
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
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
    mainRef.current?.scrollTo({ top: 0 });
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
    <div className="flex flex-col" style={{ background: "var(--bg)", height: "100dvh" }}>
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-5"
        style={{
          paddingTop: "max(12px, env(safe-area-inset-top))",
          paddingBottom: "12px",
          background: "color-mix(in oklch, var(--bg) 82%, transparent)",
          backdropFilter: "blur(20px) saturate(1.5)",
          WebkitBackdropFilter: "blur(20px) saturate(1.5)",
          borderBottom: `1px solid ${scrolled ? "var(--border)" : "transparent"}`,
          transition: "border-color 250ms ease",
        }}
      >
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
        className="flex-1 min-h-0 overflow-y-auto"
        style={{
          paddingBottom: "calc(120px + env(safe-area-inset-bottom))",
          scrollPaddingBottom: "calc(120px + env(safe-area-inset-bottom))",
          overscrollBehavior: "contain",
          overflowAnchor: "none",
          touchAction: "pan-y",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Views bleiben im DOM sobald erstmalig besucht — kein Re-fetch, kein Skeleton-Flash */}
        <div style={{ display: view === "journal" ? "block" : "none" }}>
          {visited.has("journal") && <ErrorBoundary key="journal"><JournalView onEntryChange={() => setEntryVersion((v) => v + 1)} onScrollTop={() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" })} /></ErrorBoundary>}
        </div>
        <div style={{ display: view === "calendar" ? "block" : "none" }}>
          {visited.has("calendar") && (
            <ErrorBoundary key="calendar">
              <CalendarView key={calendarJumpDate ?? "cal"} initialDate={calendarJumpDate} entryVersion={entryVersion} />
            </ErrorBoundary>
          )}
        </div>
        <div style={{ display: view === "threads" ? "block" : "none" }}>
          {visited.has("threads") && <ErrorBoundary key="threads"><ThreadsView /></ErrorBoundary>}
        </div>
        <div style={{ display: view === "review" ? "block" : "none" }}>
          {visited.has("review") && <ErrorBoundary key="review"><ReviewView onCountChange={setReviewCount} onNavigate={handleNavigate} /></ErrorBoundary>}
        </div>
      </main>

      <BottomNav current={view} onChange={handleViewChange} reviewCount={reviewCount} />

      <SWUpdatePrompt />
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} onNavigate={(date) => { setShowSearch(false); handleNavigate("calendar", date); }} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showConflicts && <ConflictModal onClose={() => setShowConflicts(false)} />}
    </div>
  );
}
