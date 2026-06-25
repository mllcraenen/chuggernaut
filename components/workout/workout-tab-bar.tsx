"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Stored in localStorage when a session page is entered, cleared when completed.
const ACTIVE_SESSION_KEY = "workout.activeSession";

export function setActiveSession(week: number, day: number) {
  try { localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ week, day })); } catch {}
}
export function clearActiveSession() {
  try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
}

export default function WorkoutTabBar() {
  const pathname = usePathname();
  const [activeSession, setActiveSessionState] = useState<{ week: number; day: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (raw) setActiveSessionState(JSON.parse(raw));
    } catch {}
  }, [pathname]);

  const onSession = pathname.startsWith("/workout/session") || pathname.startsWith("/workout/preview");
  const onHistory = pathname === "/workout/history";
  const onSettings = pathname === "/workout/settings";
  const onOverview = pathname === "/workout";

  const workoutHref = activeSession && !onSession
    ? `/workout/session/${activeSession.week}/${activeSession.day}`
    : "/workout";

  const tabs = [
    {
      label: "Overview",
      href: "/workout",
      active: onOverview,
      icon: (a: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      label: "Train",
      href: workoutHref,
      active: onSession,
      icon: (a: boolean) => (
        <svg width="26" height="24" viewBox="0 0 26 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          <line x1="1" y1="12" x2="25" y2="12" />
          <rect x="2" y="8" width="4" height="8" rx="1" /><rect x="20" y="8" width="4" height="8" rx="1" />
          <rect x="5" y="9.5" width="3" height="5" rx="0.5" /><rect x="18" y="9.5" width="3" height="5" rx="0.5" />
        </svg>
      ),
    },
    {
      label: "History",
      href: "/workout/history",
      active: onHistory,
      icon: (a: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      label: "Settings",
      href: "/workout/settings",
      active: onSettings,
      icon: (a: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-10 bg-[#141b2d]/95 backdrop-blur-sm border-t border-[#2a3352]">
      <div className="flex">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors ${
              tab.active ? "text-[#e84545]" : "text-[#8e8e93] hover:text-[#f5f5f5]"
            }`}
          >
            {tab.icon(tab.active)}
            <span className={`text-[10px] font-medium ${tab.active ? "text-[#e84545]" : ""}`}>
              {tab.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
