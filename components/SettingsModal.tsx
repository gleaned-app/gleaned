"use client";

import { useState, useRef, useEffect } from "react";
import { useSettings } from "@/lib/settings-context";
import type { AppSettings, Theme, BodyFont, AppView } from "@/lib/settings-context";
import { useT } from "@/lib/i18n";
import { exportData, importData, getAllTags, deleteTag } from "@/lib/db";
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from "@/lib/notifications";

interface Props {
  onClose: () => void;
}

type CategoryId = "appearance" | "general" | "sync" | "data" | "notifications";

function SegmentedControl<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="btn-3d flex-1 rounded-xl py-2 font-sans text-sm font-medium"
          style={{ color: value === opt.value ? "var(--accent)" : "var(--fg-muted)" }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: "var(--fg-muted)" }}>
        {label}
      </p>
      {children}
    </div>
  );
}

export default function SettingsModal({ onClose }: Props) {
  const { settings, update } = useSettings();
  const t = useT();
  const [active, setActive] = useState<CategoryId>("appearance");
  const [closing, setClosing] = useState(false);

  function handleClose() {
    setClosing(true);
    setTimeout(onClose, 190);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [couchdbInput, setCouchdbInput] = useState(settings.couchdbUrl);
  const [couchdbUser, setCouchdbUser] = useState(settings.couchdbUsername);
  const [couchdbPass, setCouchdbPass] = useState(settings.couchdbPassword);
  const [syncSaved, setSyncSaved] = useState(false);
  const [syncTestStatus, setSyncTestStatus] = useState<null | "testing" | "ok" | "error-auth" | "error-unreachable">(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [tagMap, setTagMap] = useState<Map<string, number>>(new Map());
  const [showTags, setShowTags] = useState(false);
  const [pushStatus, setPushStatus] = useState<"unsupported" | "denied" | "subscribed" | "unsubscribed">("unsubscribed");
  const [pushLoading, setPushLoading] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (showTags) getAllTags().then(setTagMap); }, [showTags]);
  useEffect(() => { getPushStatus().then(setPushStatus); }, []);

  function handleSyncSave() {
    update({ couchdbUrl: couchdbInput.trim(), couchdbUsername: couchdbUser, couchdbPassword: couchdbPass });
    setSyncSaved(true);
    setSyncTestStatus(null);
    setTimeout(() => setSyncSaved(false), 2000);
  }

  async function handleSyncTest() {
    setSyncTestStatus("testing");
    const url = couchdbInput.trim();
    if (!url) { setSyncTestStatus("error-unreachable"); return; }
    try {
      const headers: Record<string, string> = {};
      if (couchdbUser) headers["Authorization"] = "Basic " + btoa(`${couchdbUser}:${couchdbPass}`);
      const res = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(5000) });
      setSyncTestStatus(res.ok ? "ok" : res.status === 401 ? "error-auth" : "error-unreachable");
    } catch {
      setSyncTestStatus("error-unreachable");
    }
  }

  async function handlePushToggle() {
    setPushLoading(true);
    try {
      if (pushStatus === "subscribed") {
        await unsubscribeFromPush(); setPushStatus("unsubscribed");
      } else {
        const ok = await subscribeToPush(settings.language);
        setPushStatus(ok ? "subscribed" : await getPushStatus());
      }
    } finally { setPushLoading(false); }
  }

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
      setImportMsg(t.importResult(imported, skipped));
    } catch {
      setImportMsg(t.importError);
    }
    if (importRef.current) importRef.current.value = "";
    setTimeout(() => setImportMsg(null), 4000);
  }

  const THEMES: { value: Theme; label: string; bg: string; fg: string; border: string }[] = [
    { value: "system", label: t.themeAuto,  bg: "linear-gradient(135deg, oklch(92% 0.022 75) 50%, oklch(13% 0.016 55) 50%)", fg: "oklch(16% 0.03 55)", border: "oklch(16% 0.03 55 / 0.15)" },
    { value: "light",  label: t.themeLight, bg: "oklch(92% 0.022 75)",  fg: "oklch(16% 0.03 55)", border: "oklch(16% 0.03 55 / 0.15)" },
    { value: "dark",   label: t.themeDark,  bg: "oklch(13% 0.016 55)",  fg: "oklch(91% 0.022 76)", border: "oklch(91% 0.022 76 / 0.15)" },
    { value: "sepia",  label: "Sepia",      bg: "oklch(88% 0.05 82)",   fg: "oklch(22% 0.04 60)",  border: "oklch(22% 0.04 60 / 0.15)" },
  ];

  const FONTS: { value: BodyFont; label: string; sample: string; family: string }[] = [
    { value: "sans",        label: t.fontModern,      sample: "Aa", family: "var(--font-dm-sans), sans-serif" },
    { value: "serif",       label: t.fontClassic,     sample: "Aa", family: "var(--font-lora), Georgia, serif" },
    { value: "playfair",    label: t.fontElegant,     sample: "Aa", family: "var(--font-playfair), Georgia, serif" },
    { value: "handwriting", label: t.fontHandwriting, sample: "Aa", family: "var(--font-caveat), cursive" },
  ];

  const CATEGORIES: { id: CategoryId; label: string }[] = [
    { id: "appearance",    label: t.catAppearance },
    { id: "general",       label: t.catGeneral },
    { id: "sync",          label: "Sync" },
    { id: "data",          label: t.catData },
    ...(pushStatus !== "unsupported" ? [{ id: "notifications" as CategoryId, label: t.catAlerts }] : []),
  ];

  function renderContent() {
    switch (active) {
      case "appearance": return (
        <div className="flex flex-col gap-6">
          <Field label={t.colorScheme}>
            <div className="grid grid-cols-4 gap-2">
              {THEMES.map((th) => {
                const on = settings.theme === th.value;
                return (
                  <button key={th.value} onClick={() => update({ theme: th.value })} className="flex flex-col items-center gap-1.5" aria-label={th.label}>
                    <span className="flex h-10 w-full items-center justify-center rounded-xl border-2 transition-all duration-150" style={{ background: th.bg, borderColor: on ? "var(--accent)" : th.border, boxShadow: on ? "0 0 0 2px var(--accent-soft)" : undefined, transform: on ? "scale(1.05)" : "scale(1)" }}>
                      {on && <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke={th.fg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3" /></svg>}
                    </span>
                    <span className="font-sans text-[10px]" style={{ color: on ? "var(--accent)" : "var(--fg-muted)" }}>{th.label}</span>
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={t.font}>
            <div className="grid grid-cols-4 gap-2">
              {FONTS.map((f) => {
                const on = settings.bodyFont === f.value;
                return (
                  <button key={f.value} onClick={() => update({ bodyFont: f.value })} className="flex flex-col items-center gap-1.5" aria-label={f.label}>
                    <span className="flex h-10 w-full items-center justify-center rounded-xl border-2 transition-all duration-150" style={{ borderColor: on ? "var(--accent)" : "var(--border)", boxShadow: on ? "0 0 0 2px var(--accent-soft)" : undefined, transform: on ? "scale(1.05)" : "scale(1)", background: "var(--bg)", fontFamily: f.family, fontSize: "1.1rem", color: on ? "var(--accent)" : "var(--fg)" }}>
                      {f.sample}
                    </span>
                    <span className="font-sans text-[10px]" style={{ color: on ? "var(--accent)" : "var(--fg-muted)" }}>{f.label}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      );

      case "general": return (
        <div className="flex flex-col gap-6">
          <Field label={t.language}>
            <SegmentedControl<AppSettings["language"]> value={settings.language} options={[{ value: "de", label: "Deutsch" }, { value: "en", label: "English" }]} onChange={(v) => update({ language: v })} />
          </Field>
          <Field label={t.weekStartLabel}>
            <SegmentedControl<AppSettings["weekStart"]> value={settings.weekStart} options={[{ value: "monday", label: t.monday }, { value: "sunday", label: t.sunday }]} onChange={(v) => update({ weekStart: v })} />
          </Field>
          <Field label={t.defaultViewLabel}>
            <SegmentedControl<AppView>
              value={settings.defaultView}
              options={[
                { value: "journal",  label: t.navJournal },
                { value: "calendar", label: t.navCalendar },
                { value: "todos",    label: t.navLearn },
                { value: "review",   label: t.navReview },
              ]}
              onChange={(v) => update({ defaultView: v })}
            />
          </Field>
        </div>
      );

      case "sync": return (
        <div className="flex flex-col gap-4">
          <p className="font-sans text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            {t.syncDesc}
          </p>
          <Field label="URL">
            <input
              value={couchdbInput}
              onChange={(e) => { setCouchdbInput(e.target.value); setSyncTestStatus(null); }}
              placeholder="http://localhost:5984/gleaned"
              className="journal-input w-full rounded-xl px-3 py-2.5 font-sans text-xs outline-none"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--fg)" }}
              spellCheck={false} autoCapitalize="none" autoCorrect="off"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t.username}>
              <input
                value={couchdbUser}
                onChange={(e) => { setCouchdbUser(e.target.value); setSyncTestStatus(null); }}
                placeholder={t.username}
                className="journal-input w-full rounded-xl px-3 py-2.5 font-sans text-xs outline-none"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--fg)" }}
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
              />
            </Field>
            <Field label={t.dbPassword}>
              <input
                type="password"
                value={couchdbPass}
                onChange={(e) => { setCouchdbPass(e.target.value); setSyncTestStatus(null); }}
                placeholder="••••••••"
                className="journal-input w-full rounded-xl px-3 py-2.5 font-sans text-xs outline-none"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--fg)" }}
                autoCapitalize="none" autoCorrect="off"
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSyncSave}
              className="btn-3d flex-1 rounded-xl py-2.5 font-sans text-sm font-medium"
              style={{ color: syncSaved ? "var(--accent)" : "var(--fg-muted)" }}
            >
              {syncSaved ? "✓" : t.save}
            </button>
            <button
              onClick={handleSyncTest}
              disabled={syncTestStatus === "testing" || !couchdbInput.trim()}
              className="btn-3d flex-1 rounded-xl py-2.5 font-sans text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ color: "var(--fg-muted)" }}
            >
              {syncTestStatus === "testing" ? "…" : t.syncTest}
            </button>
          </div>
          {syncTestStatus && syncTestStatus !== "testing" && (
            <p className="text-center font-sans text-xs" style={{
              color: syncTestStatus === "ok" ? "var(--accent)" : "var(--due-overdue)",
            }}>
              {syncTestStatus === "ok" ? t.syncTestOk
                : syncTestStatus === "error-auth" ? t.syncTestAuth
                : t.syncTestFail}
            </p>
          )}
        </div>
      );

      case "data": return (
        <div className="flex flex-col gap-6">
          <Field label={t.exportImport}>
            <div className="flex gap-2">
              <button onClick={handleExport} className="btn-3d flex-1 rounded-xl py-2.5 font-sans text-sm font-medium" style={{ color: "var(--fg-muted)" }}>{t.export}</button>
              <button onClick={() => importRef.current?.click()} className="btn-3d flex-1 rounded-xl py-2.5 font-sans text-sm font-medium" style={{ color: "var(--fg-muted)" }}>{t.import}</button>
              <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="sr-only" />
            </div>
            {importMsg && <p className="text-center font-sans text-xs" style={{ color: "var(--accent)" }}>{importMsg}</p>}
          </Field>
          <Field label="Tags">
            <button onClick={() => setShowTags((v) => !v)} className="btn-3d w-full rounded-xl py-2.5 font-sans text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
              {showTags ? t.close : t.manageTags}
            </button>
            {showTags && tagMap.size > 0 && (
              <div className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl p-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                {[...tagMap.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => (
                  <div key={tag} className="flex items-center justify-between rounded-lg px-2 py-1">
                    <span className="font-sans text-xs" style={{ color: "var(--accent)" }}>#{tag}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-sans text-[10px]" style={{ color: "var(--fg-muted)" }}>{count}</span>
                      <button onClick={() => handleDeleteTag(tag)} className="font-sans text-xs transition-opacity hover:opacity-80" style={{ color: "var(--due-overdue)" }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showTags && tagMap.size === 0 && <p className="mt-1 text-center font-sans text-xs" style={{ color: "var(--fg-muted)" }}>{t.noTags}</p>}
          </Field>
        </div>
      );

      case "notifications": return (
        <div className="flex flex-col gap-4">
          <p className="font-sans text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            {t.notifDesc}
          </p>
          <button onClick={handlePushToggle} disabled={pushLoading || pushStatus === "denied"} className="btn-3d w-full rounded-xl py-2.5 font-sans text-sm font-medium transition-opacity" style={{ color: pushStatus === "subscribed" ? "var(--accent)" : "var(--fg-muted)", opacity: pushLoading ? 0.6 : 1 }}>
            {pushLoading ? "…" : pushStatus === "subscribed" ? t.reminderOn : pushStatus === "denied" ? t.reminderBlocked : t.reminderEnable}
          </button>
        </div>
      );
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-50${closing ? " overlay-closing" : ""}`}
        style={{ background: "oklch(0% 0 0 / 0.45)" }}
        onClick={handleClose}
      />

      {/* Mobile: bottom sheet | Desktop: centered dialog */}
      <div
        className={`${closing ? "modal-closing" : "scale-in"} fixed z-50 flex flex-col
                   bottom-0 left-0 right-0 h-[88dvh] rounded-t-3xl
                   sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2
                   sm:h-auto sm:w-[600px] sm:max-h-[80dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl`}
        style={{
          background: "var(--bg-card)",
          boxShadow: "0 -4px 40px oklch(0% 0 0 / 0.25), var(--shadow-form)",
        }}
      >

        {/* Drag handle mobile */}
        <div className="mx-auto mt-3 h-1 w-10 flex-shrink-0 rounded-full sm:hidden" style={{ background: "var(--border-focus)" }} />

        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between px-5 py-4 sm:px-6">
          <h2 className="font-serif text-xl font-normal" style={{ color: "var(--fg)" }}>
            {t.settingsTitle}
          </h2>
          <button onClick={handleClose} className="btn-3d flex h-8 w-8 items-center justify-center rounded-full font-sans text-base leading-none" style={{ color: "var(--fg-muted)" }} aria-label={t.close}>×</button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 overflow-hidden flex-col sm:flex-row">

          {/* Sidebar — vertical on desktop, horizontal tabs on mobile */}
          <nav className="flex-shrink-0 flex flex-row gap-1 overflow-x-auto border-b px-3 pb-2 sm:flex-col sm:gap-0.5 sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r sm:px-2 sm:py-2 sm:w-40" style={{ borderColor: "var(--border)" }}>
            {CATEGORIES.map((cat) => {
              const on = active === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActive(cat.id)}
                  className="flex-shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 font-sans text-xs font-medium transition-colors sm:w-full sm:rounded-xl sm:px-3 sm:py-2 sm:text-left sm:text-[13px]"
                  style={{ background: on ? "var(--accent-soft)" : "transparent", color: on ? "var(--accent)" : "var(--fg-muted)" }}
                >
                  {cat.label}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            {renderContent()}
          </div>
        </div>

        <div className="flex-shrink-0 pb-[max(12px,env(safe-area-inset-bottom))] sm:pb-2" />
      </div>
    </>
  );
}
