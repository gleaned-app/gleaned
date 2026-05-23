"use client";

import { useT } from "@/lib/i18n";

function haptic(ms = 8) {
  if (typeof navigator !== "undefined") navigator.vibrate?.(ms);
}

export type View = "journal" | "calendar" | "threads" | "review";

interface Props {
  current: View;
  onChange: (v: View) => void;
  reviewCount?: number;
}

export default function BottomNav({ current, onChange, reviewCount = 0 }: Props) {
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
      id: "threads",
      label: t.navLearn,
      icon: (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      ),
    },
    {
      id: "review",
      label: t.navReview,
      icon: (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
      ),
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center"
      style={{
        paddingBottom: "max(14px, env(safe-area-inset-bottom))",
        paddingTop: "8px",
        paddingInline: "20px",
        // Lass Touch/Click durch den transparenten Wrapper hindurch — sonst
        // blockiert Chrome's PWA Hit-Testing das Scrollen überall, wo das
        // nav-Rechteck liegt (auch links/rechts neben der Glas-Insel).
        pointerEvents: "none",
      }}
    >
      {/* Liquid glass island — wider than button group, deep 3D shadow */}
      <div
        className="relative flex items-center gap-1 px-4 py-2 sm:gap-2 sm:px-5"
        style={{
          // Pointer-Events nur auf der sichtbaren Insel reaktivieren.
          pointerEvents: "auto",
          background: "color-mix(in oklch, var(--bg-glass) 60%, transparent)",
          backdropFilter: "blur(40px) saturate(2.4) brightness(1.06)",
          WebkitBackdropFilter: "blur(40px) saturate(2.4) brightness(1.06)",
          borderRadius: "28px",
          border: "1px solid oklch(100% 0 0 / 0.18)",
          borderBottomColor: "oklch(0% 0 0 / 0.06)",
          boxShadow: [
            "0 22px 64px oklch(0% 0 0 / 0.28)",
            "0 8px 24px oklch(0% 0 0 / 0.16)",
            "0 2px 6px oklch(0% 0 0 / 0.08)",
            "inset 0 1.5px 0 oklch(100% 0 0 / 0.24)",
            "inset 0 -1px 0 oklch(0% 0 0 / 0.06)",
          ].join(", "),
        }}
      >
        {/* Glass face gradient — simulates light refraction on the surface */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "28px",
            background: "linear-gradient(160deg, oklch(100% 0 0 / 0.08) 0%, oklch(100% 0 0 / 0.02) 45%, transparent 100%)",
            pointerEvents: "none",
          }}
        />

        {tabs.map((tab) => {
          const active = current === tab.id;
          const showBadge = tab.id === "review" && reviewCount > 0;
          return (
            <button
              key={tab.id}
              data-active={active}
              onClick={() => { haptic(); onChange(tab.id); }}
              className="btn-3d relative z-10 flex flex-col items-center gap-1 rounded-2xl px-3 py-2.5 font-sans sm:px-4"
              style={{ color: active ? "var(--accent)" : "var(--fg-muted)" }}
            >
              <span className="relative">
                {tab.icon}
                {showBadge && (
                  <span
                    key={reviewCount}
                    className="badge-pop absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full font-sans text-[9px] font-bold"
                    style={{ background: "var(--due-overdue)", color: "#fff", lineHeight: 1 }}
                  >
                    {reviewCount > 9 ? "9+" : reviewCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
