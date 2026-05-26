"use client";

import { useState, useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";

// Survives the page reload triggered by skipWaiting so the banner does not
// re-appear for the same update cycle on the next mount.
const SKIP_SENT_KEY = "gleaned-sw-skip-sent";

export default function SWUpdatePrompt() {
  const t = useT();
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);
  // True only after the user explicitly clicks "Reload". Prevents the
  // controllerchange listener from reloading on the initial clients.claim()
  // call that fires when the SW first installs — that fires controllerchange
  // even though the user took no action and would cause a spurious reload.
  const skipSentRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

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
      if (skipSentRef.current && !refreshing) {
        refreshing = true;
        window.location.reload();
      }
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!waitingSW) return null;

  function handleReload() {
    setWaitingSW(null);
    skipSentRef.current = true;
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
