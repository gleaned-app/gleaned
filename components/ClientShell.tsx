"use client";

import { useState, useEffect } from "react";
import AppShell from "./AppShell";

// Render nothing on the server (blank bg), mount AppShell only on the client.
// This avoids hydration mismatches from sessionStorage/crypto that only exist
// in the browser, without relying on next/dynamic which triggers a Turbopack bug.
export default function ClientShell() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="min-h-screen" style={{ background: "var(--bg)" }} />;
  return <AppShell />;
}
