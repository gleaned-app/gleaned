"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getSettings, saveSettings, startSync, stopSync } from "./db";

export type Theme = "system" | "light" | "dark" | "sepia";
export type BodyFont = "sans" | "serif" | "playfair" | "handwriting";

export interface AppSettings {
  language: "de" | "en";
  weekStart: "monday" | "sunday";
  theme: Theme;
  bodyFont: BodyFont;
  couchdbUrl: string;
  couchdbUsername: string;
  couchdbPassword: string;
}

const ENV_URL = process.env.NEXT_PUBLIC_COUCHDB_URL ?? "";

export const DEFAULTS: AppSettings = {
  language: "de",
  weekStart: "monday",
  theme: "system",
  bodyFont: "sans",
  couchdbUrl: ENV_URL,
  couchdbUsername: "",
  couchdbPassword: "",
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

const THEME_COLOR: Record<Theme, string | null> = {
  system: null,
  light:  "#F3EDE3",
  dark:   "#15100C",
  sepia:  "#DDD0A8",
};

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.classList.remove("theme-light", "theme-dark", "theme-sepia");
  if (theme !== "system") el.classList.add(`theme-${theme}`);
  try { localStorage.setItem("gleaned-theme", theme); } catch {}

  const color = THEME_COLOR[theme];
  const existing = document.querySelector('meta[name="theme-color"][data-dynamic]') as HTMLMetaElement | null;
  if (color) {
    if (existing) {
      existing.content = color;
    } else {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = color;
      meta.dataset.dynamic = "true";
      document.head.appendChild(meta);
    }
  } else {
    existing?.remove();
  }
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
      };
      setSettings(next);
      applyTheme(next.theme);
      applyBodyFont(next.bodyFont);
      applyLanguage(next.language);
      if (next.couchdbUrl) startSync(next.couchdbUrl, next.couchdbUsername, next.couchdbPassword);
    });
  }, []);

  async function update(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (patch.theme) applyTheme(patch.theme);
    if (patch.bodyFont) applyBodyFont(patch.bodyFont);
    if (patch.language) applyLanguage(patch.language);
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
