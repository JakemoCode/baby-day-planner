import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { formatHoursMinutes, formatTimeForDisplay, formatTimeShort } from "@/v3/ui/time";
import { OwnerPill } from "./OwnerPill";
import { lastCompletedNap, napTotals } from "./dashboardStats";
import styles from "./NextSleepPanel.module.css";

export type NextSleepPanelProps = {
  nextNap: Event | undefined;
  bedtime: Event | undefined;
  actuals: Event[];
  nowMinutes: TimeMin;
  putdownLeadMinutes: number;
  owners: OwnersConfig;
};

function pluralNaps(n: number): string {
  return n === 1 ? "nap" : "naps";
}

export function NextSleepPanel({
  nextNap,
  bedtime,
  actuals,
  nowMinutes,
  putdownLeadMinutes,
  owners,
}: NextSleepPanelProps) {
  const last = lastCompletedNap(actuals);
  const totals = napTotals(actuals);

  return (
    <section className={styles.card} aria-label="Sleep stats">
      <p className={styles.heading}>Next sleep</p>
      {nextNap && (
        <p className={styles.line}>
          Putdown{" "}
          {formatTimeForDisplay(Math.max(0, nextNap.startTime - putdownLeadMinutes) as TimeMin)} →
          Nap {formatTimeForDisplay(nextNap.startTime)}{" "}
          {nextNap.owner && <OwnerPill owner={nextNap.owner} owners={owners} />}
        </p>
      )}
      {last && last.endTime !== undefined && (
        <p className={`${styles.line} ${styles.muted}`}>
          Based on last nap: {formatHoursMinutes(last.endTime - last.startTime)},{" "}
          {Math.max(0, nowMinutes - last.endTime)} min ago ({formatTimeShort(last.endTime)})
        </p>
      )}
      <p className={`${styles.line} ${styles.muted}`}>
        Today: {totals.count} {pluralNaps(totals.count)}, {formatHoursMinutes(totals.totalMinutes)}
      </p>
      {bedtime && (
        <p className={`${styles.line} ${styles.muted}`}>
          Projected bedtime: {formatTimeForDisplay(bedtime.startTime)}
        </p>
      )}
    </section>
  );
}
