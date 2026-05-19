"use client";

import { useT } from "@/lib/i18n";

type View = "journal" | "calendar" | "todos";

interface Props {
  current: View;
  onChange: (v: View) => void;
}

export default function BottomNav({ current, onChange }: Props) {
  const t = useT();

  const tabs: { id: View; label: string; icon: React.ReactNode }[] = [
    {
      id: "journal",
      label: t.navJournal,
      icon: (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
      ),
    },
    {
      id: "calendar",
      label: t.navCalendar,
      icon: (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
    },
    {
      id: "todos",
      label: t.navLearn,
      icon: (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      ),
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 sm:gap-3 sm:px-6"
      style={{
        background: "var(--bg)",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        paddingTop: "10px",
      }}
    >
      {tabs.map((tab) => {
        const active = current === tab.id;
        return (
          <button
            key={tab.id}
            data-active={active}
            onClick={() => onChange(tab.id)}
            className="btn-3d flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2.5 font-sans sm:flex-none sm:min-w-[90px] sm:px-5"
            style={{
              color: active ? "var(--accent)" : "var(--fg-muted)",
              maxWidth: 140,
            }}
          >
            {tab.icon}
            <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
