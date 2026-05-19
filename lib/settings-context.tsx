"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getSettings, saveSettings } from "./db";

export type Theme = "system" | "light" | "dark" | "sepia";

export interface AppSettings {
  language: "de" | "en";
  weekStart: "monday" | "sunday";
  theme: Theme;
}

export const DEFAULTS: AppSettings = {
  language: "de",
  weekStart: "monday",
  theme: "system",
};

export function locale(settings: AppSettings): string {
  return settings.language === "de" ? "de-DE" : "en-GB";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
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
      if (!s) return;
      const next: AppSettings = {
        language: s.language ?? DEFAULTS.language,
        weekStart: s.weekStart ?? DEFAULTS.weekStart,
        theme: s.theme ?? DEFAULTS.theme,
      };
      setSettings(next);
      applyTheme(next.theme);
    });
  }, []);

  async function update(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (patch.theme) applyTheme(patch.theme);
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
