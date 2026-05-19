import dynamic from "next/dynamic";

// AppShell is fully client-side (PouchDB, sessionStorage, crypto.subtle).
// ssr: false avoids hydration mismatches from auth state that only exists
// in the browser, and lets the LockScreen canvas start immediately.
const AppShell = dynamic(() => import("@/components/AppShell"), {
  ssr: false,
  loading: () => <div className="min-h-screen" style={{ background: "var(--bg)" }} />,
});

export default function Home() {
  return <AppShell />;
}
