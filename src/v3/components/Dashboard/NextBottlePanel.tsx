import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import {
  formatHoursMinutes,
  formatStartDelta,
  formatTimeForDisplay,
  formatTimeShort,
} from "@/v3/ui/time";
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
  const last = lastBottle(actuals, nowMinutes);
  const totals = bottleTotals(actuals, nowMinutes);
  const delta = nextBottle ? formatStartDelta(nextBottle.startTime - nowMinutes) : null;

  return (
    <section className={styles.card} aria-label="Bottle stats">
      <p className={styles.heading}>Next bottle</p>
      {nextBottle && delta && (
        <div className={styles.timeRow}>
          <span className={styles.time}>{formatTimeForDisplay(nextBottle.startTime)}</span>
          <span className={styles.delta}>{delta.text}</span>
          {nextBottle.owner && <OwnerPill owner={nextBottle.owner} owners={owners} />}
        </div>
      )}
      {last && (
        <p className={styles.line}>
          Last: {last.amountOz ?? 0}oz,{" "}
          {formatHoursMinutes(Math.max(0, nowMinutes - last.startTime))} ago (
          {formatTimeShort(last.startTime)})
        </p>
      )}
      <p className={styles.footer}>
        Today: {totals.count} {pluralBottles(totals.count)} · {totals.oz}oz
      </p>
    </section>
  );
}
