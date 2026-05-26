"use client";

import { useState, useEffect } from "react";
import AppShell from "./AppShell";
import ErrorBoundary from "./ErrorBoundary";

// Shown while the client-side JS bundle is loading and React hasn't mounted yet.
// Must use only CSS variables (no Tailwind classes that need the JS runtime) so
// it renders correctly in the static HTML before hydration.
function AppLoader() {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "var(--bg)" }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
          fontSize: "2.5rem",
          color: "var(--fg-muted)",
          animation: "pulse 1.8s ease-in-out infinite",
          userSelect: "none",
        }}
      >
        g
      </span>
    </div>
  );
}

export default function ClientShell() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <AppLoader />;
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
