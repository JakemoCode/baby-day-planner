"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useV3TomorrowDraftCount } from "@/v3/hooks/useV3TomorrowDraftCount";
import styles from "./BottomTabs.module.css";

type Tab = {
  href: string;
  label: string;
  icon: ReactNode;
};

const TABS: Tab[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12 12 4l9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    href: "/timeline",
    label: "Timeline",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <circle cx="4" cy="6" r="1.5" />
        <circle cx="4" cy="12" r="1.5" />
        <circle cx="4" cy="18" r="1.5" />
      </svg>
    ),
  },
  {
    href: "/tomorrow",
    label: "Tomorrow",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M8 3v4M16 3v4" />
        <path d="M12 13v4M10 15h4" />
      </svg>
    ),
  },
];

export type BottomTabsProps = {
  /**
   * Optional child id. When provided, BottomTabs subscribes to the
   * child's TomorrowPlan drafts and renders a notification dot on the
   * Tomorrow tab when any unconfirmed plan exists.
   */
  childId?: string;
};

export function BottomTabs({ childId }: BottomTabsProps = {}) {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Primary">
      {TABS.map((tab) => {
        const current = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={styles.tab}
            {...(current ? { "aria-current": "page" as const } : {})}
          >
            <span className={styles.icon}>
              {tab.icon}
              {tab.href === "/tomorrow" && childId !== undefined && (
                <TomorrowDot childId={childId} />
              )}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function TomorrowDot({ childId }: { childId: string }) {
  const draftCount = useV3TomorrowDraftCount(childId);
  if (draftCount === 0) return null;
  return (
    <span className={styles.dot} aria-label="Unconfirmed plan" data-testid="tomorrow-draft-dot" />
  );
}
