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
  const last = lastCompletedNap(actuals, nowMinutes);
  const totals = napTotals(actuals, nowMinutes);
  const putdownTime = nextNap && (Math.max(0, nextNap.startTime - putdownLeadMinutes) as TimeMin);

  return (
    <section className={styles.card} aria-label="Sleep stats">
      <p className={styles.heading}>Next sleep</p>
      {nextNap && (
        <>
          <div className={styles.timeRow}>
            <span className={styles.time}>{formatTimeForDisplay(nextNap.startTime)}</span>
            <span className={styles.delta}>
              {formatStartDelta(nextNap.startTime - nowMinutes).text}
            </span>
            {nextNap.owner && <OwnerPill owner={nextNap.owner} owners={owners} />}
          </div>
          {putdownTime !== undefined && (
            <p className={styles.putdown}>Putdown {formatTimeForDisplay(putdownTime)}</p>
          )}
        </>
      )}
      {last && last.endTime !== undefined && (
        <p className={styles.line}>
          Last nap: {formatHoursMinutes(last.endTime - last.startTime)},{" "}
          {Math.max(0, nowMinutes - last.endTime)} min ago ({formatTimeShort(last.endTime)})
        </p>
      )}
      <p className={styles.footer}>
        <span>
          Today: {totals.count} {pluralNaps(totals.count)} ·{" "}
          {formatHoursMinutes(totals.totalMinutes)}
        </span>
        {bedtime && <span>Bedtime {formatTimeForDisplay(bedtime.startTime)}</span>}
      </p>
    </section>
  );
}
