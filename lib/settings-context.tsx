"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getSettings, saveSettings } from "./db";

export interface AppSettings {
  language: "de" | "en";
  weekStart: "monday" | "sunday";
}

export const DEFAULTS: AppSettings = {
  language: "de",
  weekStart: "monday",
};

export function locale(settings: AppSettings): string {
  return settings.language === "de" ? "de-DE" : "en-GB";
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
      setSettings({
        language: s.language ?? DEFAULTS.language,
        weekStart: s.weekStart ?? DEFAULTS.weekStart,
      });
    });
  }, []);

  async function update(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
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
