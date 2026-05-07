"use client";

import type { Event } from "@/domain";
import { formatTimeShort } from "@/domain";
import styles from "./InstantChip.module.css";

export type InstantChipProps = {
  event: Event;
  colorMode: "type" | "owner";
  onClick?: () => void;
};

/**
 * Chip label rules:
 *   - bottle / nap-numbered types keep their event.label ("Bottle 1") so
 *     the per-event ordinal stays visible — Jake explicitly wants this.
 *   - dream_feed visually collapses to "Pump" (§3 mapping).
 *   - other routine types (pump / bedtime / wake) collapse to a short form.
 *   - user-defined `extra` events use event.label.
 */
function chipText(event: Event): string {
  if (event.type === "dream_feed") return "Pump";
  if (event.type === "bedtime") return "Bed";
  if (event.type === "wake") return "Wake";
  if (event.type === "pump") return event.label.startsWith("Pump") ? event.label : "Pump";
  // bottle / extra / fallback: keep the label as-is
  return event.label;
}

/**
 * One chip in an instant cluster. Purely presentational — geometry is
 * supplied by the parent cluster (which positions the cluster as a row).
 * Type-mode encodes type via dot color; owner-mode swaps to owner color.
 */
export function InstantChip({ event, colorMode, onClick }: InstantChipProps) {
  const interactive = !!onClick;
  const Tag = interactive ? "button" : "span";
  const time = formatTimeShort(event.startTime);
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
      <span className={styles.body}>
        <span className={styles.topRow}>
          <span className={styles.label}>{label}</span>
          <span className={styles.time}>{time}</span>
        </span>
        {event.owner && (
          <span className={styles.ownerName} data-owner={event.owner}>
            {event.owner}
          </span>
        )}
      </span>
    </Tag>
  );
}
