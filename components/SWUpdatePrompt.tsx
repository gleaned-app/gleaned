"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";

// Key stored in sessionStorage to avoid re-showing the banner for the SW
// we already told to skip waiting. Survives the reload, cleared on next mount.
const SKIP_SENT_KEY = "gleaned-sw-skip-sent";

export default function SWUpdatePrompt() {
  const t = useT();
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // If we already sent SKIP_WAITING in this session, clear the marker and
    // don't re-show the banner for the same update cycle.
    if (sessionStorage.getItem(SKIP_SENT_KEY)) {
      sessionStorage.removeItem(SKIP_SENT_KEY);
      return;
    }

    function trackInstalling(sw: ServiceWorker) {
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          setWaitingSW(sw);
        }
      });
    }

    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingSW(reg.waiting);
      }
      reg.addEventListener("updatefound", () => {
        if (reg.installing) trackInstalling(reg.installing);
      });
    });

    let refreshing = false;
    function onControllerChange() {
      if (!refreshing) { refreshing = true; window.location.reload(); }
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!waitingSW) return null;

  function handleReload() {
    // Hide immediately so a soft-reload doesn't re-show the stale banner.
    setWaitingSW(null);
    // Survive the reload: on next mount the effect will see this key and bail out.
    sessionStorage.setItem(SKIP_SENT_KEY, "1");
    waitingSW!.postMessage({ type: "SKIP_WAITING" });
  }

  return (
    <div
      className="fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-3"
      style={{
        bottom: "calc(110px + env(safe-area-inset-bottom) + 8px)",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-form)",
        maxWidth: "calc(100vw - 2.5rem)",
        whiteSpace: "nowrap",
      }}
    >
      <span className="font-sans text-sm" style={{ color: "var(--fg)" }}>
        {t.swUpdateAvailable}
      </span>
      <button
        onClick={handleReload}
        className="rounded-xl px-3 py-1.5 font-sans text-sm font-medium transition-opacity hover:opacity-80"
        style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
      >
        {t.swUpdateReload}
      </button>
    </div>
  );
}
