"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getSettings, saveSettings, startSync, stopSync } from "./db";

export type Theme = "system" | "light" | "dark" | "sepia";

export interface AppSettings {
  language: "de" | "en";
  weekStart: "monday" | "sunday";
  theme: Theme;
  couchdbUrl: string;
}

const ENV_URL = process.env.NEXT_PUBLIC_COUCHDB_URL ?? "";

export const DEFAULTS: AppSettings = {
  language: "de",
  weekStart: "monday",
  theme: "system",
  couchdbUrl: ENV_URL,
};

export function locale(settings: AppSettings): string {
  return settings.language === "de" ? "de-DE" : "en-GB";
}

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.classList.remove("theme-light", "theme-dark", "theme-sepia");
  if (theme !== "system") el.classList.add(`theme-${theme}`);
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

  useEffect(() => {
    getSettings().then((s) => {
      const next: AppSettings = {
        language: s?.language ?? DEFAULTS.language,
        weekStart: s?.weekStart ?? DEFAULTS.weekStart,
        theme: s?.theme ?? DEFAULTS.theme,
        couchdbUrl: s?.couchdbUrl ?? ENV_URL,
      };
      setSettings(next);
      applyTheme(next.theme);
      if (next.couchdbUrl) startSync(next.couchdbUrl);
    });
  }, []);

  async function update(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (patch.theme) applyTheme(patch.theme);
    if ("couchdbUrl" in patch) {
      if (patch.couchdbUrl) startSync(patch.couchdbUrl);
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
