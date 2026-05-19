"use client";

import { useState, useEffect, useRef } from "react";
import { hasPassword, setupPassword, login } from "@/lib/auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// ─── Wheat field on canvas ────────────────────────────────────────────────────

interface Grain {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number; decay: number;
  angle: number;
}

function useWheatField(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const c = canvas as HTMLCanvasElement;

    const dpr = window.devicePixelRatio || 1;
    const grains: Grain[] = [];
    let frameId = 0;

    function resize() {
      const W = window.innerWidth;
      const H = window.innerHeight;
      c.width = W * dpr;
      c.height = H * dpr;
      c.style.width  = `${W}px`;
      c.style.height = `${H}px`;
    }
    resize();

    function spawnGrain(W: number, H: number, fieldH: number) {
      const rowT = 0.3 + Math.random() * 0.7;
      const y = H - fieldH * Math.pow(rowT, 1.4) - 10;
      grains.push({
        x: Math.random() * W,
        y,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -(0.35 + Math.random() * 0.55),
        size: lerp(1.5, 4.5, rowT),
        alpha: lerp(0.25, 0.65, rowT),
        decay: 0.003 + Math.random() * 0.004,
        angle: Math.random() * Math.PI,
      });
    }

    function draw(ts: number) {
      const ctx = c.getContext("2d");
      if (!ctx) return;

      const W = c.width  / dpr;
      const H = c.height / dpr;
      const t = ts * 0.001;
      const fieldH = H * 0.44;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      // ── Wheat field rows (far → near) ────────────────────────────────────────
      const NUM_ROWS = 16;
      for (let r = 0; r < NUM_ROWS; r++) {
        // perspective: 0 = far (horizon), 1 = near (bottom)
        const p = r / (NUM_ROWS - 1);

        // Y position with natural perspective foreshortening
        const rowY = H - fieldH * Math.pow(p, 1.35);

        const stalkH    = lerp(10, 78, p);
        const stemW     = lerp(0.4, 2.4, p);
        const headW     = lerp(0.8, 5.5, p);
        const headH     = lerp(1.5, 14, p);
        const numStalks = Math.round(lerp(42, 13, p));
        const windAmp   = lerp(1.2, 16, p);
        const windSpd   = lerp(0.45, 0.85, p);
        const windFreq  = lerp(0.0055, 0.003, p);

        // Atmospheric perspective: far = pale, near = rich
        const stemL  = lerp(76, 52, p);
        const stemC  = lerp(0.06, 0.15, p);
        const headL  = stemL + 7;

        for (let s = 0; s < numStalks; s++) {
          const stalkT = (s + 0.5 + Math.sin(r * 13.1 + s * 7.9) * 0.22) / numStalks;
          const baseX  = W * stalkT;
          const baseY  = rowY;

          const phase  = t * windSpd + baseX * windFreq - r * 0.28;
          const sway   = Math.sin(phase) * windAmp
                       + Math.sin(phase * 1.8 + 0.9) * windAmp * 0.18;

          const tipX = baseX + sway;
          const tipY = baseY - stalkH;

          // Stem — quadratic bezier for natural curve
          ctx.beginPath();
          ctx.moveTo(baseX, baseY);
          ctx.quadraticCurveTo(
            baseX + sway * 0.42, baseY - stalkH * 0.58,
            tipX, tipY
          );
          ctx.strokeStyle = `oklch(${stemL}% ${stemC} 72)`;
          ctx.lineWidth = stemW;
          ctx.stroke();

          // Grain head — rotated ellipse at tip
          const tilt = Math.atan2(sway, stalkH) * 0.45;
          ctx.save();
          ctx.translate(tipX, tipY - headH * 0.35);
          ctx.rotate(tilt);
          ctx.beginPath();
          ctx.ellipse(0, 0, headW * 0.48, headH * 0.5, 0, 0, Math.PI * 2);
          ctx.fillStyle = `oklch(${headL}% ${stemC - 0.01} 74)`;
          ctx.fill();
          ctx.restore();
        }
      }

      // ── Ground fade ──────────────────────────────────────────────────────────
      const groundGrad = ctx.createLinearGradient(0, H - 30, 0, H);
      groundGrad.addColorStop(0, "transparent");
      groundGrad.addColorStop(1, "oklch(0% 0 0 / 0.04)");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, H - 30, W, 30);

      // ── Floating grains ──────────────────────────────────────────────────────
      if (grains.length < 14 && Math.random() < 0.045) spawnGrain(W, H, fieldH);

      for (let i = grains.length - 1; i >= 0; i--) {
        const g = grains[i];
        g.x     += g.vx + Math.sin(t * 0.38 + g.x * 0.009) * 0.22;
        g.y     += g.vy;
        g.alpha -= g.decay;
        g.angle += 0.01;
        if (g.alpha <= 0) { grains.splice(i, 1); continue; }

        ctx.save();
        ctx.globalAlpha = g.alpha;
        ctx.translate(g.x, g.y);
        ctx.rotate(g.angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, g.size * 0.38, g.size, 0, 0, Math.PI * 2);
        ctx.fillStyle = "oklch(68% 0.11 73)";
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
      frameId = requestAnimationFrame(draw);
    }

    frameId = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, [ref]);
}

// ─── Mouse parallax ───────────────────────────────────────────────────────────

function useMouse() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    function onMove(e: MouseEvent) {
      setPos({
        x: (e.clientX - window.innerWidth  / 2) / (window.innerWidth  / 2),
        y: (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2),
      });
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  return pos;
}

// ─── Lock screen ─────────────────────────────────────────────────────────────

interface Props { onAuth: () => void; }

export default function LockScreen({ onAuth }: Props) {
  const [mode, setMode] = useState<"loading" | "setup" | "login">("loading");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focused,  setFocused]  = useState<"pw" | "confirm" | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useWheatField(canvasRef);
  const mouse = useMouse();

  useEffect(() => {
    hasPassword().then((has) => setMode(has ? "login" : "setup"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!password.trim()) return;
    if (mode === "setup") {
      if (password !== confirm) { setError("Passwörter stimmen nicht überein."); return; }
      if (password.length < 4)  { setError("Mindestens 4 Zeichen."); return; }
      setSubmitting(true);
      await setupPassword(password);
      onAuth();
    } else {
      setSubmitting(true);
      const ok = await login(password);
      if (ok) { onAuth(); }
      else { setError("Falsches Passwort."); setPassword(""); setSubmitting(false); }
    }
  }

  if (mode === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="h-5 w-5 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  // Parallax transform helpers — word closest, form furthest
  const px = (strength: number) =>
    `translate(${mouse.x * -strength}px, ${mouse.y * (strength * 0.65)}px)`;

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-8 py-16"
      style={{ background: "var(--bg)" }}
    >
      {/* Canvas — full-screen wheat field */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0"
        style={{ zIndex: 0 }}
      />

      {/* Radial veil — keeps text readable over field */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 68% 62% at 50% 48%, var(--bg) 28%, transparent 100%)",
          zIndex: 1,
        }}
        aria-hidden
      />

      {/* ── Content ── */}
      <div className="relative w-full max-w-[480px]" style={{ zIndex: 10 }}>

        {/* Layer 1 — Wordmark (nearest, moves most) */}
        <div
          className="mb-10"
          style={{
            transform: px(16),
            transition: "transform 0.1s ease-out",
            animation: "fade-up 0.65s ease both",
          }}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h1
              className="font-serif italic leading-none"
              style={{
                fontSize: "clamp(3.8rem, 13vw, 6.5rem)",
                color: "var(--fg)",
                letterSpacing: "-0.02em",
              }}
            >
              gleaned
            </h1>
            <div className="flex flex-shrink-0 flex-col items-end gap-1 pb-2">
              <span className="font-serif italic text-sm" style={{ color: "var(--accent)" }}>
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
        </div>

        {/* Layer 2 — Definitions (mid-depth) */}
        <div
          style={{
            transform: px(8),
            transition: "transform 0.15s ease-out",
            animation: "def-fade 0.7s ease 0.22s both",
          }}
        >
          <div
            className="mb-5 h-px"
            style={{
              background: "var(--border-focus)",
              animation: "rule-draw 0.65s ease 0.3s both",
            }}
          />
          <div className="flex flex-col gap-3.5">
            <div className="flex gap-3">
              <span className="w-4 flex-shrink-0 font-serif text-sm"
                style={{ color: "var(--accent)", opacity: 0.7 }}>1</span>
              <p className="font-serif text-base leading-relaxed" style={{ color: "var(--fg)" }}>
                to collect gradually and bit by bit; to gather the knowledge left behind by each day.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="w-4 flex-shrink-0 font-serif text-sm"
                style={{ color: "var(--accent)", opacity: 0.7 }}>2</span>
              <p className="font-serif text-base leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                <span
                  className="mr-2 font-sans text-[10px] uppercase tracking-[0.15em]"
                  style={{ color: "var(--accent)", opacity: 0.55 }}
                >
                  archaic
                </span>
                to gather leftover grain from a harvested field.
              </p>
            </div>
          </div>
          <div
            className="mt-7 h-px"
            style={{
              background: "var(--border-focus)",
              animation: "rule-draw 0.65s ease 0.52s both",
            }}
          />
        </div>

        {/* Layer 3 — Form (furthest, barely moves) */}
        <form
          onSubmit={handleSubmit}
          className="mt-8 flex flex-col gap-5"
          style={{
            transform: px(3),
            transition: "transform 0.22s ease-out",
            animation: "def-fade 0.7s ease 0.58s both",
          }}
        >
          <div>
            <label
              className="mb-1.5 block font-sans text-[10px] uppercase tracking-[0.18em]"
              style={{ color: "var(--fg-muted)" }}
            >
              {mode === "setup" ? "Passwort wählen" : "Passwort"}
            </label>
            <div style={{
              borderBottom: `1.5px solid ${focused === "pw" ? "var(--accent)" : "var(--border-focus)"}`,
              transition: "border-color 200ms",
            }}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused("pw")}
                onBlur={() => setFocused(null)}
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
              <div style={{
                borderBottom: `1.5px solid ${focused === "confirm" ? "var(--accent)" : "var(--border-focus)"}`,
                transition: "border-color 200ms",
              }}>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onFocus={() => setFocused("confirm")}
                  onBlur={() => setFocused(null)}
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
            <span className="font-serif text-sm italic" style={{ color: "var(--fg-muted)", opacity: 0.4 }}>
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
