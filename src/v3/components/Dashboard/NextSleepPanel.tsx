import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import {
  formatHoursMinutes,
  formatStartDelta,
  formatTimeForDisplay,
  formatTimeShort,
} from "@/v3/ui/time";
import { OwnerPill } from "./OwnerPill";
import { lastCompletedNap, napTotals } from "./dashboardStats";
import styles from "./NextSleepPanel.module.css";

export type NextSleepPanelProps = {
  nextSleep: Event | undefined;
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
  nextSleep,
  bedtime,
  actuals,
  nowMinutes,
  putdownLeadMinutes,
  owners,
}: NextSleepPanelProps) {
  const last = lastCompletedNap(actuals, nowMinutes);
  const totals = napTotals(actuals, nowMinutes);
  const isBedtimeNext = nextSleep?.type === "bedtime";
  // Putdown is a nap-prep affordance; not shown for the bedtime row.
  const putdownTime =
    nextSleep && !isBedtimeNext
      ? (Math.max(0, nextSleep.startTime - putdownLeadMinutes) as TimeMin)
      : undefined;
  const delta = nextSleep ? formatStartDelta(nextSleep.startTime - nowMinutes) : null;

  return (
    <section className={styles.card} aria-label="Sleep stats">
      <p className={styles.heading}>Next sleep</p>
      {nextSleep && delta && (
        <>
          <div className={styles.timeRow}>
            {isBedtimeNext && <span className={styles.label}>Bedtime</span>}
            <span className={styles.time}>{formatTimeForDisplay(nextSleep.startTime)}</span>
            <span className={styles.delta}>{delta.text}</span>
            {nextSleep.owner && <OwnerPill owner={nextSleep.owner} owners={owners} />}
          </div>
          {putdownTime !== undefined && (
            <p className={styles.putdown}>Putdown {formatTimeForDisplay(putdownTime)}</p>
          )}
        </>
      )}
      {last && last.endTime !== undefined && (
        <p className={styles.line}>
          Last nap: {formatHoursMinutes(last.endTime - last.startTime)},{" "}
          {formatHoursMinutes(Math.max(0, nowMinutes - last.endTime))} ago (
          {formatTimeShort(last.endTime)})
        </p>
      )}
      <p className={styles.footer}>
        <span>
          Today: {totals.count} {pluralNaps(totals.count)} ·{" "}
          {formatHoursMinutes(totals.totalMinutes)}
        </span>
        {/* End-of-day marker — omitted when bedtime is already the prominent next sleep. */}
        {bedtime && !isBedtimeNext && (
          <span>Bedtime {formatTimeForDisplay(bedtime.startTime)}</span>
        )}
      </p>
    </section>
  );
}
