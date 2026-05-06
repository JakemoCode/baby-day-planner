import type { Event } from "@/domain";
import { formatTimeForDisplay } from "@/domain";
import styles from "./PreviewCard.module.css";

export type NextBottlePreviewProps = {
  bottle: Event | undefined;
  /** True when no Bottle 1 has been logged yet — show the start-of-day prompt. */
  bottle1Pending?: boolean;
};

function formatOz(oz: number): string {
  return Number.isInteger(oz) ? `${oz} oz` : `${oz} oz`;
}

export function NextBottlePreview({ bottle, bottle1Pending = false }: NextBottlePreviewProps) {
  if (!bottle) {
    const message = bottle1Pending ? "Start first bottle for schedule" : "No more bottles today";
    return (
      <article className={styles.card} aria-label="Next bottle">
        <p className={styles.heading}>Next bottle</p>
        <p className={styles.empty}>{message}</p>
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
    </article>
  );
}
