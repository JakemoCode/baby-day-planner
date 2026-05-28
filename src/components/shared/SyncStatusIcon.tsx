"use client";

import { useEffect, useState } from "react";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import styles from "./SyncStatusIcon.module.css";

export type SyncStatusIconProps = {
  onRefresh?: () => void;
};

function relativeTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function SyncStatusIcon({ onRefresh }: SyncStatusIconProps) {
  const { online, lastSyncedAt } = useSyncStatus();
  const [now, setNow] = useState<number>(() => Date.now());

  // Ticks every 30s to refresh the relative-time label.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  let label: string;
  let stateClass: string;

  if (!online) {
    label = "Offline · tap to retry";
    stateClass = styles.offline ?? "";
  } else if (lastSyncedAt === null) {
    label = "Connecting…";
    stateClass = styles.connecting ?? "";
  } else {
    const ago = relativeTime(now - lastSyncedAt);
    label = `Synced ${ago} · tap to refresh`;
    stateClass = styles.online ?? "";
  }

  return (
    <button
      type="button"
      className={`${styles.button} ${stateClass}`}
      aria-label={label}
      onClick={onRefresh}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M17.5 19a4.5 4.5 0 1 0-1.5-8.74A6 6 0 0 0 4 11.5a4 4 0 0 0 1 7.9" />
        <circle cx="12" cy="14" r="1.5" fill="currentColor" />
      </svg>
    </button>
  );
}
