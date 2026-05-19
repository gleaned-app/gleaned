"use client";

import { useState, useRef, useEffect } from "react";
import { useSettings } from "@/lib/settings-context";
import type { AppSettings, Theme } from "@/lib/settings-context";
import { exportData, importData, getAllTags, deleteTag } from "@/lib/db";

interface Props {
  onClose: () => void;
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          data-active={value === opt.value}
          onClick={() => onChange(opt.value)}
          className="btn-3d flex-1 rounded-xl py-2.5 font-sans text-sm font-medium"
          style={{ color: value === opt.value ? "var(--accent)" : "var(--fg-muted)" }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="mb-2.5 font-sans text-[11px] font-medium tracking-[0.15em] uppercase"
        style={{ color: "var(--fg-muted)" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

export default function SettingsModal({ onClose }: Props) {
  const { settings, update } = useSettings();
  const [couchdbInput, setCouchdbInput] = useState(settings.couchdbUrl);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [tagMap, setTagMap] = useState<Map<string, number>>(new Map());
  const [showTags, setShowTags] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const de = settings.language === "de";

  useEffect(() => {
    if (showTags) getAllTags().then(setTagMap);
  }, [showTags]);

  async function handleDeleteTag(tag: string) {
    await deleteTag(tag);
    setTagMap((prev) => { const n = new Map(prev); n.delete(tag); return n; });
  }

  async function handleExport() {
    const json = await exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gleaned-export-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { imported, skipped } = await importData(text);
      setImportMsg(de ? `${imported} importiert, ${skipped} übersprungen` : `${imported} imported, ${skipped} skipped`);
    } catch {
      setImportMsg(de ? "Fehler beim Importieren" : "Import failed");
    }
    if (importRef.current) importRef.current.value = "";
    setTimeout(() => setImportMsg(null), 4000);
  }

  const t = settings.language === "de"
    ? { lang: "Sprache", week: "Wochenanfang", mon: "Montag", sun: "Sonntag", title: "Einstellungen", appearance: "Aussehen" }
    : { lang: "Language", week: "Week starts on", mon: "Monday", sun: "Sunday", title: "Settings", appearance: "Appearance" };

  const THEMES: { value: Theme; label: string; bg: string; fg: string; border: string }[] = [
    { value: "system", label: settings.language === "de" ? "System" : "System",
      bg: "linear-gradient(135deg, oklch(92% 0.022 75) 50%, oklch(13% 0.016 55) 50%)",
      fg: "oklch(16% 0.03 55)", border: "oklch(16% 0.03 55 / 0.15)" },
    { value: "light",  label: settings.language === "de" ? "Hell"   : "Light",
      bg: "oklch(92% 0.022 75)", fg: "oklch(16% 0.03 55)", border: "oklch(16% 0.03 55 / 0.15)" },
    { value: "dark",   label: settings.language === "de" ? "Dunkel" : "Dark",
      bg: "oklch(13% 0.016 55)", fg: "oklch(91% 0.022 76)", border: "oklch(91% 0.022 76 / 0.15)" },
    { value: "sepia",  label: "Sepia",
      bg: "oklch(88% 0.05 82)",  fg: "oklch(22% 0.04 60)",  border: "oklch(22% 0.04 60 / 0.15)" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: "oklch(0% 0 0 / 0.45)" }}
        onClick={onClose}
      />

      {/* Sheet — slides up from bottom on mobile, centered modal on desktop */}
      <div
        className="scale-in fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-5
                   sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-[360px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:pb-6"
        style={{
          background: "var(--bg-card)",
          boxShadow: "0 -4px 40px oklch(0% 0 0 / 0.25), var(--shadow-form)",
        }}
      >
        {/* Handle (mobile) */}
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full sm:hidden"
          style={{ background: "var(--border-focus)" }}
        />

        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-serif text-xl font-normal" style={{ color: "var(--fg)" }}>
            {t.title}
          </h2>
          <button
            onClick={onClose}
            className="btn-3d flex h-8 w-8 items-center justify-center rounded-full font-sans text-base leading-none"
            style={{ color: "var(--fg-muted)" }}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-6">
          {/* Theme picker */}
          <Row label={t.appearance}>
            <div className="grid grid-cols-4 gap-2">
              {THEMES.map((th) => {
                const active = settings.theme === th.value;
                return (
                  <button
                    key={th.value}
                    onClick={() => update({ theme: th.value })}
                    className="flex flex-col items-center gap-1.5"
                    aria-label={th.label}
                  >
                    <span
                      className="flex h-10 w-full items-center justify-center rounded-xl border-2 transition-all duration-150"
                      style={{
                        background: th.bg,
                        borderColor: active ? "var(--accent)" : th.border,
                        boxShadow: active ? "0 0 0 2px var(--accent-soft)" : undefined,
                        transform: active ? "scale(1.05)" : "scale(1)",
                      }}
                    >
                      {active && (
                        <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke={th.fg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="2 6 5 9 10 3" />
                        </svg>
                      )}
                    </span>
                    <span className="font-sans text-[10px]" style={{ color: active ? "var(--accent)" : "var(--fg-muted)" }}>
                      {th.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </Row>

          <Row label={t.lang}>
            <SegmentedControl<AppSettings["language"]>
              value={settings.language}
              options={[
                { value: "de", label: "Deutsch" },
                { value: "en", label: "English" },
              ]}
              onChange={(v) => update({ language: v })}
            />
          </Row>

          <Row label={t.week}>
            <SegmentedControl<AppSettings["weekStart"]>
              value={settings.weekStart}
              options={[
                { value: "monday", label: t.mon },
                { value: "sunday", label: t.sun },
              ]}
              onChange={(v) => update({ weekStart: v })}
            />
          </Row>

          <Row label="Sync (CouchDB)">
            <input
              value={couchdbInput}
              onChange={(e) => setCouchdbInput(e.target.value)}
              onBlur={() => {
                const trimmed = couchdbInput.trim();
                if (trimmed !== settings.couchdbUrl) update({ couchdbUrl: trimmed });
              }}
              placeholder="http://admin:pass@localhost:5984/gleaned"
              className="journal-input w-full rounded-xl px-3 py-2.5 font-sans text-xs outline-none"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </Row>

          <Row label={de ? "Tags" : "Tags"}>
            <button
              onClick={() => setShowTags((v) => !v)}
              className="btn-3d w-full rounded-xl py-2.5 font-sans text-sm font-medium"
              style={{ color: "var(--fg-muted)" }}
            >
              {showTags ? (de ? "Schließen" : "Close") : (de ? "Tags verwalten" : "Manage tags")}
            </button>
            {showTags && tagMap.size > 0 && (
              <div
                className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl p-2"
                style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
              >
                {[...tagMap.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([tag, count]) => (
                    <div key={tag} className="flex items-center justify-between rounded-lg px-2 py-1">
                      <span className="font-sans text-xs" style={{ color: "var(--accent)" }}>
                        #{tag}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-sans text-[10px]" style={{ color: "var(--fg-muted)" }}>
                          {count}
                        </span>
                        <button
                          onClick={() => handleDeleteTag(tag)}
                          className="font-sans text-xs transition-opacity hover:opacity-80"
                          style={{ color: "var(--due-overdue)" }}
                          title={de ? "Tag entfernen" : "Remove tag"}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            {showTags && tagMap.size === 0 && (
              <p className="mt-2 text-center font-sans text-xs" style={{ color: "var(--fg-muted)" }}>
                {de ? "Keine Tags vorhanden" : "No tags yet"}
              </p>
            )}
          </Row>

          <Row label={de ? "Daten" : "Data"}>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={handleExport}
                  className="btn-3d flex-1 rounded-xl py-2.5 font-sans text-sm font-medium"
                  style={{ color: "var(--fg-muted)" }}
                >
                  {de ? "Exportieren" : "Export"}
                </button>
                <button
                  onClick={() => importRef.current?.click()}
                  className="btn-3d flex-1 rounded-xl py-2.5 font-sans text-sm font-medium"
                  style={{ color: "var(--fg-muted)" }}
                >
                  {de ? "Importieren" : "Import"}
                </button>
                <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="sr-only" />
              </div>
              {importMsg && (
                <p className="text-center font-sans text-xs" style={{ color: "var(--accent)" }}>
                  {importMsg}
                </p>
              )}
            </div>
          </Row>
        </div>
      </div>
    </>
  );
}
