import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { formatTimeForDisplay, formatTimeShort } from "@/v3/ui/time";
import { OwnerPill } from "./OwnerPill";
import { bottleTotals, lastBottle } from "./dashboardStats";
import styles from "./NextBottlePanel.module.css";

export type NextBottlePanelProps = {
  nextBottle: Event | undefined;
  actuals: Event[];
  nowMinutes: TimeMin;
  owners: OwnersConfig;
};

function pluralBottles(n: number): string {
  return n === 1 ? "bottle" : "bottles";
}

export function NextBottlePanel({ nextBottle, actuals, nowMinutes, owners }: NextBottlePanelProps) {
  const last = lastBottle(actuals);
  const totals = bottleTotals(actuals);

  return (
    <section className={styles.card} aria-label="Bottle stats">
      <p className={styles.heading}>Next bottle</p>
      {nextBottle && (
        <p className={styles.line}>
          Next bottle: {formatTimeForDisplay(nextBottle.startTime)}{" "}
          {nextBottle.owner && <OwnerPill owner={nextBottle.owner} owners={owners} />}
        </p>
      )}
      {last && (
        <p className={`${styles.line} ${styles.muted}`}>
          Based on last bottle: {last.amountOz ?? 0}oz, {Math.max(0, nowMinutes - last.startTime)}{" "}
          min ago ({formatTimeShort(last.startTime)})
        </p>
      )}
      <p className={`${styles.line} ${styles.muted}`}>
        Today: {totals.count} {pluralBottles(totals.count)}, {totals.oz}oz
      </p>
    </section>
  );
}
