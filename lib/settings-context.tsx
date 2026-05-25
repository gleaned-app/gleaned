"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getSettings, saveSettings, startSync, stopSync } from "./db";

export type Theme = "system" | "light" | "dark" | "sepia";
export type BodyFont = "sans" | "serif" | "playfair" | "handwriting";
export type AppView = "journal" | "calendar" | "threads" | "review";

export interface AppSettings {
  language: "de" | "en";
  weekStart: "monday" | "sunday";
  theme: Theme;
  bodyFont: BodyFont;
  couchdbUrl: string;
  couchdbUsername: string;
  couchdbPassword: string;
  defaultView: AppView;
  customEntryTypes: string[];
  contextSources: string[];
}

const CONTEXT_DEFAULTS: Record<"de" | "en", string[]> = {
  de: ["Arbeit", "Schule", "Unterwegs", "Zuhause"],
  en: ["Work", "School", "Commute", "Home"],
};

const ENV_URL = process.env.NEXT_PUBLIC_COUCHDB_URL ?? "";

export const DEFAULTS: AppSettings = {
  language: "de",
  weekStart: "monday",
  theme: "system",
  bodyFont: "sans",
  couchdbUrl: ENV_URL,
  couchdbUsername: "",
  couchdbPassword: "",
  defaultView: "journal",
  customEntryTypes: [],
  contextSources: [],
};

const FONT_MAP: Record<BodyFont, string> = {
  sans:        "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif",
  serif:       "var(--font-lora), Georgia, serif",
  playfair:    "var(--font-playfair), Georgia, serif",
  handwriting: "var(--font-caveat), cursive",
};

function applyBodyFont(font: BodyFont) {
  document.documentElement.style.setProperty("--font-body", FONT_MAP[font]);
  try { localStorage.setItem("gleaned-font", font); } catch {}
}

function applyLanguage(lang: "de" | "en") {
  document.documentElement.lang = lang;
  try { localStorage.setItem("gleaned-lang", lang); } catch {}
  navigator.serviceWorker?.ready
    .then((reg) => reg.active?.postMessage({ type: "SET_LANG", lang }))
    .catch(() => {});
}

export function locale(settings: AppSettings): string {
  return settings.language === "de" ? "de-DE" : "en-GB";
}

const THEME_COLOR: Record<string, string> = {
  light: "#F3EDE3",
  dark:  "#15100C",
  sepia: "#DDD0A8",
};

function setDynamicThemeColor(effective: "light" | "dark" | "sepia" | null) {
  const existing = document.querySelector('meta[name="theme-color"][data-dynamic]') as HTMLMetaElement | null;
  const color = effective ? THEME_COLOR[effective] : null;
  if (color) {
    if (existing) { existing.content = color; return; }
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = color;
    meta.dataset.dynamic = "true";
    document.head.appendChild(meta);
  } else {
    existing?.remove();
  }
}

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.classList.remove("theme-light", "theme-dark", "theme-sepia");
  if (theme === "system") {
    // Use JS to detect preference — CSS media-query cascade can be unreliable
    // with backdrop-filter + color-mix in some browsers
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) el.classList.add("theme-dark");
    setDynamicThemeColor(prefersDark ? "dark" : null);
  } else {
    el.classList.add(`theme-${theme}`);
    setDynamicThemeColor(theme);
  }
  try { localStorage.setItem("gleaned-theme", theme); } catch {}
}

type Ctx = {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => Promise<void>;
};

const SettingsContext = createContext<Ctx>({
  settings: DEFAULTS,
  update: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);

  // Keep theme-dark class in sync when OS preference changes while theme === "system"
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function sync(dark: boolean) {
      document.documentElement.classList.toggle("theme-dark", dark);
      setDynamicThemeColor(dark ? "dark" : null);
    }
    const handler = (e: MediaQueryListEvent) => sync(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [settings.theme]);

  useEffect(() => {
    getSettings().then((s) => {
      const next: AppSettings = {
        language: s?.language ?? DEFAULTS.language,
        weekStart: s?.weekStart ?? DEFAULTS.weekStart,
        theme: s?.theme ?? DEFAULTS.theme,
        bodyFont: (s?.bodyFont as BodyFont | undefined) ?? DEFAULTS.bodyFont,
        couchdbUrl: s?.couchdbUrl ?? ENV_URL,
        couchdbUsername: s?.couchdbUsername ?? "",
        couchdbPassword: s?.couchdbPassword ?? "",
        defaultView: (s?.defaultView as AppView | undefined) ?? DEFAULTS.defaultView,
        customEntryTypes: s?.customEntryTypes ?? [],
        contextSources: s?.contextSources ?? CONTEXT_DEFAULTS[s?.language ?? DEFAULTS.language] ?? CONTEXT_DEFAULTS[DEFAULTS.language],
      };
      setSettings(next);
      applyTheme(next.theme);
      applyBodyFont(next.bodyFont);
      applyLanguage(next.language);
      try { localStorage.setItem("gleaned-view", next.defaultView); } catch {}
      if (next.couchdbUrl && next.couchdbPassword) startSync(next.couchdbUrl, next.couchdbUsername, next.couchdbPassword);
    });
    return () => stopSync();
  }, []);

  async function update(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (patch.theme) applyTheme(patch.theme);
    if (patch.bodyFont) applyBodyFont(patch.bodyFont);
    if (patch.language) applyLanguage(patch.language);
    if (patch.defaultView) { try { localStorage.setItem("gleaned-view", patch.defaultView); } catch {} }
    const syncChanged = "couchdbUrl" in patch || "couchdbUsername" in patch || "couchdbPassword" in patch;
    if (syncChanged) {
      if (next.couchdbUrl) startSync(next.couchdbUrl, next.couchdbUsername, next.couchdbPassword);
      else stopSync();
    }
    await saveSettings(next);
  }

  return (
    <SettingsContext.Provider value={{ settings, update }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
