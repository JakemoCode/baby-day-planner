"use client";

import type { Event } from "@/domain";
import { formatTimeForDisplay } from "@/domain";
import styles from "./InstantChip.module.css";

export type InstantChipProps = {
  event: Event;
  colorMode: "type" | "owner";
  onClick?: () => void;
};

const NICE_LABELS: Partial<Record<Event["type"], string>> = {
  bottle: "Bottle",
  pump: "Pump",
  dream_feed: "Pump", // visually identical per §3
  bedtime: "Bed",
  wake: "Wake",
  extra: "Custom",
};

function chipText(event: Event): string {
  return NICE_LABELS[event.type] ?? event.label;
}

/**
 * One chip in an instant cluster. Purely presentational — geometry is
 * supplied by the parent cluster (which positions the cluster as a row).
 * Type-mode encodes type via dot color; owner-mode swaps to owner color.
 */
export function InstantChip({ event, colorMode, onClick }: InstantChipProps) {
  const interactive = !!onClick;
  const Tag = interactive ? "button" : "span";
  const time = formatTimeForDisplay(event.startTime);
  const label = chipText(event);
  const a11y = `${event.label} at ${time}${event.owner ? ` ${event.owner}` : ""}`;

  return (
    <Tag
      data-testid="instant-chip"
      data-type={event.type}
      data-color-mode={colorMode}
      data-static={!interactive}
      {...(event.owner ? { "data-owner": event.owner } : {})}
      className={styles.chip}
      {...(interactive
        ? { type: "button" as const, onClick, "aria-label": a11y }
        : { role: "presentation" as const })}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
      <span className={styles.time}>{time}</span>
    </Tag>
  );
}
