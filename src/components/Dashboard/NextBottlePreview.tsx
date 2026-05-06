import type { Event } from "@/domain";
import { formatTimeForDisplay } from "@/domain";
import styles from "./PreviewCard.module.css";

export type NextBottlePreviewProps = {
  bottle: Event | undefined;
  /** True when no Bottle 1 has been logged yet — show the start-of-day prompt. */
  bottle1Pending?: boolean;
  /** Most recent logged bottle, shown as subtext when present. */
  lastBottle?: Event;
};

function formatOz(oz: number): string {
  return `${oz} oz`;
}

function formatLast(b: Event): string {
  const time = formatTimeForDisplay(b.startTime);
  return b.amountOz != null ? `Last: ${time} · ${formatOz(b.amountOz)}` : `Last: ${time}`;
}

export function NextBottlePreview({
  bottle,
  bottle1Pending = false,
  lastBottle,
}: NextBottlePreviewProps) {
  if (!bottle) {
    const message = bottle1Pending ? "Start first bottle for schedule" : "No more bottles today";
    return (
      <article className={styles.card} aria-label="Next bottle">
        <p className={styles.heading}>Next bottle</p>
        <p className={styles.empty}>{message}</p>
        {lastBottle && <p className={styles.meta}>{formatLast(lastBottle)}</p>}
      </article>
    );
  }

  const subtitle =
    bottle.source === "projected"
      ? `projected · based on ${bottle.amountOz != null ? formatOz(bottle.amountOz) : ""} ${bottle.label}`.trim()
      : `logged · ${bottle.amountOz != null ? formatOz(bottle.amountOz) : ""} ${bottle.label}`.trim();

  return (
    <article className={styles.card} aria-label="Next bottle">
      <p className={styles.heading}>Next bottle</p>
      <p className={styles.primary}>{formatTimeForDisplay(bottle.startTime)}</p>
      <p className={styles.subtitle}>{subtitle}</p>
      {lastBottle && <p className={styles.meta}>{formatLast(lastBottle)}</p>}
    </article>
  );
}
