"use client";

import { useState } from "react";
import { logout } from "@/lib/auth";
import { useT } from "@/lib/i18n";

interface Props {
  onLock: () => void;
  onSettings: () => void;
}

export default function ProfileButton({ onLock, onSettings }: Props) {
  const [open, setOpen] = useState(false);
  const t = useT();

  function handleLock() {
    setOpen(false);
    logout();
    onLock();
  }

  function handleSettings() {
    setOpen(false);
    onSettings();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-3d flex h-8 w-8 items-center justify-center rounded-full"
        style={{ color: "var(--accent)" }}
        aria-label={t.settings}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="scale-in absolute right-0 top-10 z-50 min-w-[180px] overflow-hidden rounded-2xl font-sans text-sm"
            style={{
              background: "var(--bg-card)",
              boxShadow: "var(--shadow-form)",
              border: "1px solid var(--border)",
            }}
          >
            <button
              onClick={handleSettings}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-[var(--accent-soft)]"
              style={{ color: "var(--fg)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              {t.settings}
            </button>

            <div style={{ height: "1px", background: "var(--border)", margin: "0 12px" }} />

            <button
              onClick={handleLock}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-[var(--accent-soft)]"
              style={{ color: "var(--fg)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              {t.lock}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
