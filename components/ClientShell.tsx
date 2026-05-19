"use client";

import dynamic from "next/dynamic";

const AppShell = dynamic(() => import("./AppShell"), {
  ssr: false,
  loading: () => <div className="min-h-screen" style={{ background: "var(--bg)" }} />,
});

export default function ClientShell() {
  return <AppShell />;
}
