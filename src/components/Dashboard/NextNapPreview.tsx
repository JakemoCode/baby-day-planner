import type { Event } from "@/domain";
import { formatTimeForDisplay } from "@/domain";
import styles from "./PreviewCard.module.css";

export type NextNapPreviewProps = {
  nap: Event | undefined;
};

/**
 * Render a nap as either "9:45–10:30 AM" (range) or "9:45 AM" (in-progress).
 * Drops the AM/PM from the start when both ends share the same period.
 */
function formatNapRange(start: string, end: string | undefined): string {
  if (!end) return formatTimeForDisplay(start);
  const startStr = formatTimeForDisplay(start);
  const endStr = formatTimeForDisplay(end);
  const startPeriod = startStr.slice(-2);
  const endPeriod = endStr.slice(-2);
  if (startPeriod === endPeriod) {
    return `${startStr.replace(/\s(AM|PM)$/, "")}–${endStr}`;
  }
  return `${startStr} – ${endStr}`;
}

export function NextNapPreview({ nap }: NextNapPreviewProps) {
  if (!nap) {
    return (
      <article className={styles.card} aria-label="Next nap">
        <p className={styles.heading}>Next nap</p>
        <p className={styles.empty}>No more naps today</p>
      </article>
    );
  }

  const range = formatNapRange(nap.startTime, nap.endTime);
  const subtitle = nap.owner ? `${nap.label} · ${nap.owner}` : nap.label;

  return (
    <article className={styles.card} aria-label="Next nap">
      <p className={styles.heading}>Next nap</p>
      <p className={styles.primary}>{range}</p>
      <p className={styles.subtitle}>{subtitle}</p>
    </article>
  );
}
