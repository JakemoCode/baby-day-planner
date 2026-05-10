import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { formatTimeForDisplay } from "@/v3/ui/time";
import { ownerDisplayName } from "@/v3/ui/owners";
import styles from "./PreviewCard.module.css";

export type NextNapPreviewProps = {
  nap: Event | undefined;
  owners: OwnersConfig;
  /** Most recent recorded nap, shown as subtext when present. */
  lastNap?: Event;
  /** Projected bedtime event. Replaces empty state when no more naps. */
  bedtime?: Event;
};

/**
 * Render a nap as either "9:45–10:30 AM" (range) or "9:45 AM" (in-progress).
 * Drops AM/PM from the start when both ends share the same period.
 */
function formatNapRange(start: TimeMin, end: TimeMin | undefined): string {
  if (end === undefined) return formatTimeForDisplay(start);
  const startStr = formatTimeForDisplay(start);
  const endStr = formatTimeForDisplay(end);
  const startPeriod = startStr.slice(-2);
  const endPeriod = endStr.slice(-2);
  if (startPeriod === endPeriod) {
    return `${startStr.replace(/\s(AM|PM)$/, "")}–${endStr}`;
  }
  return `${startStr} – ${endStr}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatLast(n: Event): string {
  if (n.endTime === undefined) {
    return `Last: started ${formatTimeForDisplay(n.startTime)} · in progress`;
  }
  return `Last: ${formatNapRange(n.startTime, n.endTime)} · ${formatDuration(n.endTime - n.startTime)}`;
}

export function NextNapPreview({ nap, owners, lastNap, bedtime }: NextNapPreviewProps) {
  if (!nap) {
    if (bedtime) {
      return (
        <article className={styles.card} aria-label="Next nap">
          <p className={styles.heading}>Next nap</p>
          <p className={styles.primary}>Bedtime at {formatTimeForDisplay(bedtime.startTime)}</p>
          {lastNap && <p className={styles.meta}>{formatLast(lastNap)}</p>}
        </article>
      );
    }
    return (
      <article className={styles.card} aria-label="Next nap">
        <p className={styles.heading}>Next nap</p>
        <p className={styles.empty}>No more naps today</p>
        {lastNap && <p className={styles.meta}>{formatLast(lastNap)}</p>}
      </article>
    );
  }

  const range = formatNapRange(nap.startTime, nap.endTime);
  const ownerName = ownerDisplayName(nap.owner, owners);
  const subtitle = ownerName ? `${nap.label} · ${ownerName}` : nap.label;

  return (
    <article className={styles.card} aria-label="Next nap">
      <p className={styles.heading}>Next nap</p>
      <p className={styles.primary}>{range}</p>
      <p className={styles.subtitle}>{subtitle}</p>
      {lastNap && <p className={styles.meta}>{formatLast(lastNap)}</p>}
    </article>
  );
}
