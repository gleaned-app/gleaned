"use client";

import { useState, useEffect } from "react";
import { hasPassword, setupPassword, login } from "@/lib/auth";

// Grains rise from the bottom — the gleaning metaphor made visible
const GRAINS = [
  { x: "4%",   y: "96%", w: 2, h: 7,  dur: 14, delay: 0    },
  { x: "11%",  y: "99%", w: 3, h: 9,  dur: 18, delay: 2.4  },
  { x: "19%",  y: "94%", w: 2, h: 6,  dur: 12, delay: 0.9  },
  { x: "27%",  y: "98%", w: 3, h: 8,  dur: 16, delay: 4.1  },
  { x: "36%",  y: "95%", w: 2, h: 7,  dur: 13, delay: 1.7  },
  { x: "44%",  y: "97%", w: 2, h: 5,  dur: 15, delay: 3.3  },
  { x: "52%",  y: "93%", w: 3, h: 8,  dur: 17, delay: 0.5  },
  { x: "61%",  y: "99%", w: 2, h: 6,  dur: 11, delay: 5.2  },
  { x: "69%",  y: "95%", w: 3, h: 9,  dur: 14, delay: 1.1  },
  { x: "76%",  y: "98%", w: 2, h: 7,  dur: 19, delay: 2.9  },
  { x: "84%",  y: "94%", w: 2, h: 5,  dur: 13, delay: 0.3  },
  { x: "91%",  y: "97%", w: 3, h: 8,  dur: 16, delay: 3.8  },
  { x: "8%",   y: "97%", w: 2, h: 6,  dur: 20, delay: 6.0  },
  { x: "55%",  y: "100%",w: 2, h: 7,  dur: 12, delay: 4.5  },
  { x: "33%",  y: "96%", w: 3, h: 9,  dur: 15, delay: 7.1  },
];

function GrainField() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {GRAINS.map((g, i) => (
        <span
          key={i}
          className="absolute"
          style={{
            left: g.x,
            top: g.y,
            width: g.w,
            height: g.h,
            borderRadius: "50%",
            background: "var(--accent)",
            animation: `grain-rise ${g.dur}s ease-in-out ${g.delay}s infinite`,
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
  const [focusedField, setFocusedField] = useState<"pw" | "confirm" | null>(null);

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
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-8 py-16"
      style={{ background: "var(--bg)" }}
    >
      <GrainField />

      {/* Subtle vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, oklch(0% 0 0 / 0.06) 100%)",
        }}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-[480px]">

        {/* ── Dictionary entry ── */}
        <div className="mb-10">

          {/* Word + meta on same row */}
          <div className="flex items-baseline justify-between gap-4">
            <h1
              className="font-serif italic leading-none tracking-tight"
              style={{
                fontSize: "clamp(4rem, 14vw, 6.5rem)",
                color: "var(--fg)",
                letterSpacing: "-0.02em",
                animation: "fade-up 0.7s ease both",
              }}
            >
              gleaned
            </h1>
            <div
              className="flex flex-shrink-0 flex-col items-end gap-1 pb-1"
              style={{ animation: "def-fade 0.7s ease 0.15s both" }}
            >
              <span
                className="font-serif italic text-sm"
                style={{ color: "var(--accent)" }}
              >
                /ɡliːnd/
              </span>
              <span
                className="font-sans text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "var(--fg-muted)" }}
              >
                verb · past tense
              </span>
            </div>
          </div>

          {/* Rule */}
          <div
            className="my-5 h-px w-full"
            style={{
              background: "var(--border-focus)",
              animation: "rule-draw 0.6s ease 0.3s both",
            }}
          />

          {/* Definitions */}
          <div
            className="flex flex-col gap-3.5"
            style={{ animation: "def-fade 0.7s ease 0.45s both" }}
          >
            <div className="flex gap-3">
              <span
                className="w-4 flex-shrink-0 font-serif text-sm"
                style={{ color: "var(--accent)", opacity: 0.7 }}
              >
                1
              </span>
              <p className="font-serif text-base leading-relaxed" style={{ color: "var(--fg)" }}>
                to collect gradually and bit by bit; to gather the knowledge left behind by each day.
              </p>
            </div>
            <div className="flex gap-3">
              <span
                className="w-4 flex-shrink-0 font-serif text-sm"
                style={{ color: "var(--accent)", opacity: 0.7 }}
              >
                2
              </span>
              <p className="font-serif text-base leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                <span
                  className="mr-2 font-sans text-[10px] uppercase tracking-[0.15em]"
                  style={{ color: "var(--accent)", opacity: 0.6 }}
                >
                  archaic
                </span>
                to gather leftover grain from a harvested field.
              </p>
            </div>
          </div>

          {/* Rule */}
          <div
            className="mt-8 h-px w-full"
            style={{
              background: "var(--border-focus)",
              animation: "rule-draw 0.6s ease 0.6s both",
            }}
          />
        </div>

        {/* ── Form ── */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5"
          style={{ animation: "def-fade 0.7s ease 0.75s both" }}
        >
          <div>
            <label
              className="mb-1.5 block font-sans text-[10px] uppercase tracking-[0.18em]"
              style={{ color: "var(--fg-muted)" }}
            >
              {mode === "setup" ? "Passwort wählen" : "Passwort"}
            </label>
            <div
              style={{
                borderBottom: `1.5px solid ${focusedField === "pw" ? "var(--accent)" : "var(--border-focus)"}`,
                transition: "border-color 200ms",
              }}
            >
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField("pw")}
                onBlur={() => setFocusedField(null)}
                autoFocus
                className="journal-input w-full bg-transparent py-2 font-sans text-base outline-none"
                style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
              />
            </div>
          </div>

          {mode === "setup" && (
            <div>
              <label
                className="mb-1.5 block font-sans text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "var(--fg-muted)" }}
              >
                Bestätigen
              </label>
              <div
                style={{
                  borderBottom: `1.5px solid ${focusedField === "confirm" ? "var(--accent)" : "var(--border-focus)"}`,
                  transition: "border-color 200ms",
                }}
              >
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onFocus={() => setFocusedField("confirm")}
                  onBlur={() => setFocusedField(null)}
                  className="journal-input w-full bg-transparent py-2 font-sans text-base outline-none"
                  style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="font-sans text-sm" style={{ color: "oklch(55% 0.18 25)" }}>
              {error}
            </p>
          )}

          <div className="flex items-center justify-between pt-1">
            <span
              className="font-serif text-sm italic"
              style={{ color: "var(--fg-muted)", opacity: 0.5 }}
            >
              {mode === "setup" ? "mindestens 4 Zeichen" : ""}
            </span>
            <button
              type="submit"
              disabled={submitting || !password.trim()}
              className="rounded-full px-6 py-2.5 font-sans text-sm font-medium tracking-wide transition-all"
              style={{
                background: password.trim() ? "var(--fg)" : "transparent",
                color: password.trim() ? "var(--bg)" : "var(--fg-muted)",
                border: `1.5px solid ${password.trim() ? "var(--fg)" : "var(--border-focus)"}`,
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "…" : mode === "setup" ? "Loslegen" : "Entsperren"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
