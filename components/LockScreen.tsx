"use client";

import { useState, useEffect } from "react";
import { hasPassword, setupPassword, login } from "@/lib/auth";

// Scattered grain dots — the visual metaphor of gleaning
const GRAINS = [
  { x: "8%",  y: "12%", r: 3, dur: 5.2, delay: 0    },
  { x: "88%", y: "18%", r: 4, dur: 6.8, delay: 1.1  },
  { x: "15%", y: "55%", r: 2, dur: 4.6, delay: 0.7  },
  { x: "82%", y: "62%", r: 5, dur: 7.1, delay: 2.0  },
  { x: "25%", y: "82%", r: 3, dur: 5.8, delay: 0.3  },
  { x: "72%", y: "78%", r: 2, dur: 4.9, delay: 1.6  },
  { x: "50%", y: "8%",  r: 4, dur: 6.2, delay: 0.9  },
  { x: "92%", y: "42%", r: 3, dur: 5.5, delay: 1.8  },
  { x: "5%",  y: "35%", r: 2, dur: 6.0, delay: 0.5  },
  { x: "60%", y: "90%", r: 3, dur: 5.1, delay: 2.3  },
  { x: "38%", y: "72%", r: 2, dur: 7.4, delay: 1.3  },
  { x: "78%", y: "30%", r: 4, dur: 4.8, delay: 0.2  },
];

function GrainField() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {GRAINS.map((g, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: g.x,
            top: g.y,
            width: g.r * 2,
            height: g.r * 2,
            background: "var(--accent)",
            animation: `grain-drift ${g.dur}s ease-in-out ${g.delay}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

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
      if (ok) {
        onAuth();
      } else {
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
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-8"
      style={{ background: "var(--bg)" }}
    >
      <GrainField />

      <div className="fade-up relative z-10 w-full max-w-[300px]">

        {/* Wordmark */}
        <div className="mb-10 text-center">
          <p
            className="mb-3 font-sans text-[10px] font-medium tracking-[0.35em] uppercase"
            style={{ color: "var(--accent)", opacity: 0.7 }}
          >
            /ɡliːnd/
          </p>
          <h1
            className="font-serif text-[5rem] font-normal italic leading-none tracking-tight"
            style={{ color: "var(--fg)" }}
          >
            gleaned
          </h1>
          <p
            className="mt-5 font-serif text-sm italic leading-relaxed"
            style={{ color: "var(--fg-muted)" }}
          >
            {mode === "setup"
              ? "Willkommen. Wähle ein Passwort\num dein Journal zu schützen."
              : "to gather slowly, bit by bit —\nwhat the day left behind."}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div
            style={{
              borderBottom: `1px solid var(--border-focus)`,
            }}
          >
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "setup" ? "Passwort wählen" : "Passwort"}
              autoFocus
              className="journal-input w-full bg-transparent py-2.5 font-sans text-base outline-none"
              style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
            />
          </div>

          {mode === "setup" && (
            <div style={{ borderBottom: "1px solid var(--border-focus)" }}>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Passwort bestätigen"
                className="journal-input w-full bg-transparent py-2.5 font-sans text-base outline-none"
                style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
              />
            </div>
          )}

          {error && (
            <p className="font-sans text-sm" style={{ color: "oklch(55% 0.18 25)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !password.trim()}
            className="mt-2 rounded-full py-3 font-sans text-sm font-medium tracking-wide transition-all"
            style={{
              background: password.trim() ? "var(--fg)" : "var(--border-focus)",
              color: password.trim() ? "var(--bg)" : "var(--fg-muted)",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting
              ? "…"
              : mode === "setup"
              ? "Loslegen"
              : "Entsperren"}
          </button>
        </form>
      </div>
    </div>
  );
}
