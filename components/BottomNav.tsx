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
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
      ),
    },
    {
      id: "calendar",
      label: t.navCalendar,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
    },
    {
      id: "threads",
      label: t.navLearn,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      ),
    },
    {
      id: "review",
      label: t.navReview,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
      ),
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "color-mix(in oklch, var(--bg-nav) 88%, transparent)",
        backdropFilter: "blur(24px) saturate(2) brightness(1.04)",
        WebkitBackdropFilter: "blur(24px) saturate(2) brightness(1.04)",
        borderTop: "0.5px solid color-mix(in oklch, var(--border) 60%, transparent)",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        paddingTop: "4px",
      }}
    >
      <div className="mx-auto flex w-full max-w-lg items-stretch">
        {tabs.map((tab) => {
          const active = current === tab.id;
          const showBadge = tab.id === "review" && reviewCount > 0;
          return (
            <button
              key={tab.id}
              data-active={active}
              onClick={() => { haptic(); onChange(tab.id); }}
              className="relative flex flex-1 flex-col items-center justify-center gap-[5px] py-3 font-sans transition-opacity active:opacity-60"
              style={{
                color: active ? "var(--accent)" : "var(--fg-muted)",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {/* active indicator line at top */}
              {active && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "28px",
                    height: "2px",
                    borderRadius: "0 0 2px 2px",
                    background: "var(--accent)",
                  }}
                />
              )}

              <span className="relative">
                {tab.icon}
                {showBadge && (
                  <span
                    key={reviewCount}
                    className="badge-pop absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-0.5 font-sans text-[9px] font-bold"
                    style={{ background: "var(--due-overdue)", color: "#fff", lineHeight: 1 }}
                  >
                    {reviewCount > 9 ? "9+" : reviewCount}
                  </span>
                )}
              </span>

              <span
                className="text-[10px] font-medium tracking-wide"
                style={{ opacity: active ? 1 : 0.72 }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
