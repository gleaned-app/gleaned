"use client";

import { useState, useEffect, useRef } from "react";
import { hasPassword, setupPassword, login } from "@/lib/auth";
import { bootstrapFromCouchDB } from "@/lib/db";
import { useT } from "@/lib/i18n";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MIN_PASSWORD_LENGTH = 10;

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// Returns 0 (below minimum), 1 (weak), 2 (fair), 3 (strong).
function getPasswordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length === 0) return 0;
  if (pw.length < MIN_PASSWORD_LENGTH) return 1;
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^a-zA-Z0-9]/.test(pw)) classes++;
  if (pw.length >= 14 && classes >= 3) return 3;
  if (classes >= 2) return 2;
  return 1;
}

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

const LOCKOUT_KEY = "gleaned_lockout_until";
const LOCKOUT_ATTEMPTS_KEY = "gleaned_lockout_attempts";

interface Props { onAuth: () => void; }

export default function LockScreen({ onAuth }: Props) {
  const [mode, setMode] = useState<"loading" | "choose" | "setup" | "login" | "connect">("loading");
  const [hasLocalAccount, setHasLocalAccount] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState("");
  const [hint,     setHint]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focused,  setFocused]  = useState<"pw" | "confirm" | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [lockSecsLeft, setLockSecsLeft] = useState(0);
  const [acceptShortPw, setAcceptShortPw] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Connect-existing-account flow
  const [connectUrl,  setConnectUrl]  = useState("");
  const [connectUser, setConnectUser] = useState("");
  const [connectPass, setConnectPass] = useState("");
  const [connectSubmitting, setConnectSubmitting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [showConnectPass, setShowConnectPass] = useState(false);

  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useWheatField(canvasRef);
  const mouse = useMouse();

  useEffect(() => {
    // Restore lockout state from sessionStorage so a page reload doesn't reset brute-force protection.
    const storedUntil = sessionStorage.getItem(LOCKOUT_KEY);
    const storedAttempts = sessionStorage.getItem(LOCKOUT_ATTEMPTS_KEY);
    if (storedUntil) {
      const until = Number(storedUntil);
      if (until > Date.now()) {
        setLockUntil(until);
        setLockSecsLeft(Math.ceil((until - Date.now()) / 1000));
        if (storedAttempts) setFailedAttempts(Number(storedAttempts));
      } else {
        sessionStorage.removeItem(LOCKOUT_KEY);
        sessionStorage.removeItem(LOCKOUT_ATTEMPTS_KEY);
      }
    }
    hasPassword().then((has) => {
      setHasLocalAccount(has);
      setMode(has ? "login" : "choose");
    });
  }, []);

  useEffect(() => {
    if (!lockUntil) return;
    const id = setInterval(() => {
      const left = Math.ceil((lockUntil - Date.now()) / 1000);
      if (left <= 0) {
        sessionStorage.removeItem(LOCKOUT_KEY);
        sessionStorage.removeItem(LOCKOUT_ATTEMPTS_KEY);
        setLockUntil(null);
        setLockSecsLeft(0);
        setError("");
      } else {
        setLockSecsLeft(left);
      }
    }, 250);
    return () => clearInterval(id);
  }, [lockUntil]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lockUntil) return;
    setError("");
    if (!password.trim()) return;
    if (mode === "setup") {
      if (password !== confirm) { setError(t.passwordMismatch); return; }
      if (password.length < MIN_PASSWORD_LENGTH && !acceptShortPw) { setError(t.passwordTooShort); return; }
      setSubmitting(true);
      try {
        await setupPassword(password);
        onAuth();
      } catch {
        setError(t.genericError);
      } finally {
        setSubmitting(false);
      }
    } else {
      setSubmitting(true);
      try {
        const ok = await login(password);
        if (ok) {
          onAuth();
        } else {
          const attempts = failedAttempts + 1;
          setFailedAttempts(attempts);
          if (attempts === 1) {
            setError(t.wrongPassword);
          } else {
            // Exponential backoff from 2nd attempt: 2^(n-2) seconds, capped at 30 s
            const delaySecs = Math.min(Math.pow(2, attempts - 2), 30);
            const until = Date.now() + delaySecs * 1000;
            sessionStorage.setItem(LOCKOUT_KEY, String(until));
            sessionStorage.setItem(LOCKOUT_ATTEMPTS_KEY, String(attempts));
            setLockUntil(until);
            setLockSecsLeft(delaySecs);
            setError(t.tooManyAttempts(delaySecs));
          }
          setPassword("");
        }
      } catch {
        setError(t.genericError);
      } finally {
        setSubmitting(false);
      }
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!connectUrl.trim()) return;
    setConnectError("");
    setConnectSubmitting(true);
    try {
      const result = await bootstrapFromCouchDB(connectUrl, connectUser, connectPass);
      if (result === "ok") {
        setMode("login");
        setHint(t.connectSuccess);
        setError("");
        setPassword("");
      } else if (result === "auth-error") {
        setConnectError(t.connectAuthError);
      } else if (result === "not-found") {
        setConnectError(t.connectNotFound);
      } else {
        setConnectError(t.connectNetworkError);
      }
    } finally {
      setConnectSubmitting(false);
    }
  }

  // Parallax transform helpers — word closest, form furthest
  const px = (strength: number) =>
    `translate(${mouse.x * -strength}px, ${mouse.y * (strength * 0.65)}px)`;

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-x-hidden overflow-y-auto px-8 py-16"
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
              className="leading-none"
              style={{
                fontSize: "clamp(3.8rem, 13vw, 6.5rem)",
                color: "var(--fg)",
                fontFamily: "var(--font-caveat), cursive",
                fontWeight: 500,
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
        {mode === "loading" ? (
          <div className="mt-12 flex justify-center">
            <div
              className="h-5 w-5 animate-spin rounded-full border-2"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }}
            />
          </div>
        ) : mode === "choose" ? (
          <div
            className="mt-8 flex flex-col gap-5"
            style={{
              transform: px(3),
              transition: "transform 0.22s ease-out",
              animation: "def-fade 0.7s ease 0.58s both",
            }}
          >
            <p className="font-serif text-sm leading-relaxed" style={{ color: "var(--fg-muted)", opacity: 0.7 }}>
              {t.firstTimePrompt}
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => { setMode("setup"); setError(""); setPassword(""); setConfirm(""); }}
                className="w-full rounded-full py-2.5 font-sans text-sm font-medium tracking-wide transition-all"
                style={{
                  background: "var(--fg)",
                  color: "var(--bg)",
                  border: "1.5px solid var(--fg)",
                }}
              >
                {t.register}
              </button>
              <button
                onClick={() => { setMode("connect"); setConnectError(""); setConnectUrl(""); setConnectUser(""); setConnectPass(""); }}
                className="w-full rounded-full py-2.5 font-sans text-sm font-medium tracking-wide transition-all"
                style={{
                  background: "transparent",
                  color: "var(--accent)",
                  border: "1.5px solid var(--accent)",
                }}
              >
                {t.connectAccount}
              </button>
              <button
                onClick={() => { setMode("login"); setError(""); setPassword(""); }}
                className="w-full rounded-full py-2.5 font-sans text-sm font-medium tracking-wide transition-all"
                style={{
                  background: "transparent",
                  color: "var(--fg-muted)",
                  border: "1.5px solid var(--border-focus)",
                }}
              >
                {t.signin}
              </button>
            </div>
          </div>
        ) : mode === "connect" ? (
          <form
            onSubmit={handleConnect}
            className="mt-8 flex flex-col gap-5"
            style={{
              transform: px(3),
              transition: "transform 0.22s ease-out",
              animation: "def-fade 0.7s ease 0.58s both",
            }}
          >
            <p className="font-serif text-sm leading-relaxed" style={{ color: "var(--fg-muted)", opacity: 0.7 }}>
              {t.connectPrompt}
            </p>

            {/* Server URL */}
            <div>
              <label className="mb-1.5 block font-sans text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--fg-muted)" }}>
                {t.connectCouchdbUrl}
              </label>
              <div style={{ borderBottom: `1.5px solid ${focused === "pw" ? "var(--accent)" : "var(--border-focus)"}`, transition: "border-color 200ms" }}>
                <input
                  type="url"
                  value={connectUrl}
                  onChange={(e) => setConnectUrl(e.target.value)}
                  onFocus={() => setFocused("pw")}
                  onBlur={() => setFocused(null)}
                  autoFocus
                  placeholder="https://gleaned.example.com/db/gleaned"
                  className="journal-input w-full bg-transparent py-2 font-sans text-base outline-none"
                  style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
                />
              </div>
            </div>

            {/* CouchDB username */}
            <div>
              <label className="mb-1.5 block font-sans text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--fg-muted)" }}>
                {t.connectCouchdbUser}
              </label>
              <div style={{ borderBottom: `1.5px solid var(--border-focus)` }}>
                <input
                  type="text"
                  autoComplete="username"
                  value={connectUser}
                  onChange={(e) => setConnectUser(e.target.value)}
                  className="journal-input w-full bg-transparent py-2 font-sans text-base outline-none"
                  style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
                />
              </div>
            </div>

            {/* CouchDB password */}
            <div>
              <label className="mb-1.5 block font-sans text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--fg-muted)" }}>
                {t.connectCouchdbPass}
              </label>
              <div className="relative" style={{ borderBottom: `1.5px solid var(--border-focus)` }}>
                <input
                  type={showConnectPass ? "text" : "password"}
                  autoComplete="current-password"
                  value={connectPass}
                  onChange={(e) => setConnectPass(e.target.value)}
                  className="journal-input w-full bg-transparent py-2 pr-8 font-sans text-base outline-none"
                  style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
                />
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setShowConnectPass(v => !v); }}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: "var(--fg-muted)" }}
                  tabIndex={-1}
                >
                  {showConnectPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {connectError && (
              <p className="font-sans text-sm" style={{ color: "oklch(55% 0.18 25)" }}>
                {connectError}
              </p>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => { setMode("choose"); setConnectError(""); }}
                className="font-sans text-xs transition-opacity hover:opacity-60"
                style={{ color: "var(--fg-muted)" }}
              >
                {t.back}
              </button>
              <button
                type="submit"
                disabled={connectSubmitting || !connectUrl.trim()}
                className="rounded-full px-6 py-2.5 font-sans text-sm font-medium tracking-wide transition-all"
                style={{
                  background: connectUrl.trim() ? "var(--fg)" : "transparent",
                  color: connectUrl.trim() ? "var(--bg)" : "var(--fg-muted)",
                  border: `1.5px solid ${connectUrl.trim() ? "var(--fg)" : "var(--border-focus)"}`,
                  opacity: connectSubmitting ? 0.6 : 1,
                }}
              >
                {connectSubmitting ? "…" : t.connectAction}
              </button>
            </div>
          </form>
        ) : (
        <form
          onSubmit={handleSubmit}
          className="mt-8 flex flex-col gap-5"
          style={{
            transform: px(3),
            transition: "transform 0.22s ease-out",
            animation: "def-fade 0.7s ease 0.58s both",
          }}
        >
          {mode === "setup" && (
            <p className="font-serif text-sm leading-relaxed" style={{ color: "var(--fg-muted)", opacity: 0.7 }}>
              {t.encryptionNotice}
            </p>
          )}
          <div>
            <label
              className="mb-1.5 block font-sans text-[10px] uppercase tracking-[0.18em]"
              style={{ color: "var(--fg-muted)" }}
            >
              {mode === "setup" ? t.choosePassword : t.password}
            </label>
            <div className="relative" style={{
              borderBottom: `1.5px solid ${focused === "pw" ? "var(--accent)" : "var(--border-focus)"}`,
              transition: "border-color 200ms",
            }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  const v = e.target.value;
                  setPassword(v);
                  if (v.length >= MIN_PASSWORD_LENGTH) setAcceptShortPw(false);
                }}
                onFocus={() => setFocused("pw")}
                onBlur={() => setFocused(null)}
                autoFocus
                className="journal-input w-full bg-transparent py-2 pr-8 font-sans text-base outline-none"
                style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
              />
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setShowPassword(v => !v); }}
                className="absolute right-0 top-1/2 -translate-y-1/2 p-1"
                style={{ color: "var(--fg-muted)" }}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {mode === "setup" && password.length > 0 && (() => {
            const strength = getPasswordStrength(password);
            const strengthColor =
              strength === 3 ? "oklch(62% 0.17 145)" :
              strength === 2 ? "oklch(72% 0.18 55)" :
                               "oklch(62% 0.18 25)";
            const strengthLabel =
              strength === 3 ? t.pwStrong :
              strength === 2 ? t.pwFair :
                               t.pwWeak;
            return (
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1">
                  {([1, 2, 3] as const).map((seg) => (
                    <div
                      key={seg}
                      className="h-0.5 flex-1 rounded-full transition-all duration-300"
                      style={{ background: strength >= seg ? strengthColor : "var(--border-focus)" }}
                    />
                  ))}
                </div>
                {strength > 0 && (
                  <span className="font-sans text-[10px]" style={{ color: strengthColor }}>
                    {strengthLabel}
                  </span>
                )}
              </div>
            );
          })()}

          {mode === "setup" && password.length > 0 && password.length < MIN_PASSWORD_LENGTH && (
            <label
              className="flex cursor-pointer items-start gap-2.5"
              style={{ animation: "def-fade 0.25s ease both" }}
            >
              <input
                type="checkbox"
                checked={acceptShortPw}
                onChange={(e) => setAcceptShortPw(e.target.checked)}
                className="mt-0.5 flex-shrink-0"
                style={{ accentColor: "var(--accent)", width: 13, height: 13 }}
              />
              <span className="font-sans text-[11px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                {t.acceptShortPw}
              </span>
            </label>
          )}

          {mode === "setup" && (
            <div>
              <label
                className="mb-1.5 block font-sans text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "var(--fg-muted)" }}
              >
                {t.confirm}
              </label>
              <div className="relative" style={{
                borderBottom: `1.5px solid ${focused === "confirm" ? "var(--accent)" : "var(--border-focus)"}`,
                transition: "border-color 200ms",
              }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onFocus={() => setFocused("confirm")}
                  onBlur={() => setFocused(null)}
                  className="journal-input w-full bg-transparent py-2 pr-8 font-sans text-base outline-none"
                  style={{ color: "var(--fg)", caretColor: "var(--accent)" }}
                />
              </div>
            </div>
          )}

          {hint && !error && (
            <p className="font-sans text-sm" style={{ color: "var(--accent)" }}>
              {hint}
            </p>
          )}

          {error && (
            <p className="font-sans text-sm" style={{ color: "oklch(55% 0.18 25)" }}>
              {error}
            </p>
          )}

          {(() => {
            const shortBlocked = mode === "setup" && password.length > 0 && password.length < MIN_PASSWORD_LENGTH && !acceptShortPw;
            const btnActive = !!password.trim() && !lockUntil && !shortBlocked;
            return (
              <div className="flex items-center justify-between pt-1">
                <span className="font-serif text-sm italic" style={{ color: "var(--fg-muted)", opacity: 0.4 }}>
                  {mode === "setup" ? t.minChars : ""}
                </span>
                <button
                  type="submit"
                  disabled={submitting || !password.trim() || !!lockUntil || shortBlocked}
                  className="rounded-full px-6 py-2.5 font-sans text-sm font-medium tracking-wide transition-all"
                  style={{
                    background: btnActive ? "var(--fg)" : "transparent",
                    color: btnActive ? "var(--bg)" : "var(--fg-muted)",
                    border: `1.5px solid ${btnActive ? "var(--fg)" : "var(--border-focus)"}`,
                    opacity: (submitting || !!lockUntil) ? 0.6 : 1,
                  }}
                >
                  {submitting ? "…" : lockUntil ? `${lockSecsLeft}s` : mode === "setup" ? t.getStarted : t.unlock}
                </button>
              </div>
            );
          })()}

          {!hasLocalAccount && (
            <button
              type="button"
              onClick={() => { setMode("choose"); setError(""); setPassword(""); setConfirm(""); }}
              className="font-sans text-xs transition-opacity hover:opacity-60"
              style={{ color: "var(--fg-muted)", textAlign: "left" }}
            >
              {t.back}
            </button>
          )}

          {mode === "login" && hasLocalAccount && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(t.connectOverwriteWarning)) return;
                setMode("connect");
                setHint("");
                setError("");
                setConnectError("");
                setConnectUrl("");
                setConnectUser("");
                setConnectPass("");
              }}
              className="font-sans text-xs transition-opacity hover:opacity-60"
              style={{ color: "var(--fg-muted)", opacity: 0.5, textAlign: "left" }}
            >
              {t.connectAccount}
            </button>
          )}
        </form>
        )}
      </div>
    </div>
  );
}
