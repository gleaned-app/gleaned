"use client";

import { useState, useEffect } from "react";
import { hasPassword, setupPassword, login } from "@/lib/auth";

interface Props {
  onAuth: () => void;
}

export default function LockScreen({ onAuth }: Props) {
  const [mode, setMode] = useState<"loading" | "setup" | "login">("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    hasPassword().then((has) => setMode(has ? "login" : "setup"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!password.trim()) return;

    if (mode === "setup") {
      if (password !== confirm) { setError("Passwörter stimmen nicht überein."); return; }
      if (password.length < 4) { setError("Mindestens 4 Zeichen."); return; }
      setSubmitting(true);
      await setupPassword(password);
      onAuth();
    } else {
      setSubmitting(true);
      const ok = await login(password);
      if (ok) { onAuth(); }
      else {
        setError("Falsches Passwort.");
        setPassword("");
        setSubmitting(false);
      }
    }
  }

  if (mode === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="h-5 w-5 animate-spin rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6" style={{ background: "var(--bg)" }}>
      <div className="fade-up w-full max-w-[320px]">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl font-serif text-2xl italic"
            style={{ background: "var(--bg-card)", boxShadow: "var(--shadow-card)", color: "var(--accent)" }}
          >
            g
          </div>
          <h1 className="font-serif text-2xl" style={{ color: "var(--fg)" }}>
            {mode === "setup" ? "Willkommen" : "gleaned"}
          </h1>
          <p className="mt-1 font-sans text-sm" style={{ color: "var(--fg-muted)" }}>
            {mode === "setup" ? "Lege ein Passwort fest" : "Passwort eingeben"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passwort"
            autoFocus
            className="journal-input w-full rounded-xl px-4 py-3 font-sans text-base outline-none"
            style={{
              background: "var(--bg-card)",
              color: "var(--fg)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-card)",
            }}
          />

          {mode === "setup" && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Passwort bestätigen"
              className="journal-input w-full rounded-xl px-4 py-3 font-sans text-base outline-none"
              style={{
                background: "var(--bg-card)",
                color: "var(--fg)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-card)",
              }}
            />
          )}

          {error && (
            <p className="font-sans text-sm" style={{ color: "oklch(55% 0.18 25)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-xl py-3 font-sans text-sm font-medium transition-opacity"
            style={{
              background: "var(--fg)",
              color: "var(--bg)",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {mode === "setup" ? "Passwort festlegen" : "Entsperren"}
          </button>
        </form>
      </div>
    </div>
  );
}
