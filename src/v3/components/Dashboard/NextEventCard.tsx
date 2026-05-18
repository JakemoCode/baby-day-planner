import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { formatHoursMinutes, formatTimeForDisplay } from "@/v3/ui/time";
import { OwnerPill } from "./OwnerPill";
import styles from "./NextEventCard.module.css";

export type NextEventCardProps = {
  event: Event | undefined;
  nowMinutes: TimeMin;
  owners: OwnersConfig;
  putdownLeadMinutes: number;
};

function formatDelta(deltaMinutes: number): { text: string; isNow: boolean } {
  if (deltaMinutes <= 0) return { text: "now", isNow: true };
  return { text: `in ${formatHoursMinutes(deltaMinutes)}`, isNow: false };
}

export function NextEventCard({
  event,
  nowMinutes,
  owners,
  putdownLeadMinutes,
}: NextEventCardProps) {
  if (!event) {
    return (
      <div className={styles.empty} role="status">
        <p>No more events — have a good night.</p>
      </div>
    );
  }

  const delta = formatDelta(event.startTime - nowMinutes);
  const showPutdown = event.type === "nap" || event.type === "bedtime";
  const putdownTime = Math.max(0, event.startTime - putdownLeadMinutes) as TimeMin;

  return (
    <article className={styles.card} aria-label="Next event">
      <p className={styles.heading}>Next event</p>
      <h2 className={styles.label}>{event.label}</h2>
      <div className={styles.timeRow}>
        <span className={styles.time}>{formatTimeForDisplay(event.startTime)}</span>
        <span className={`${styles.delta} ${delta.isNow ? styles.deltaNow : ""}`}>
          {delta.text}
        </span>
        <OwnerPill owner={event.owner} owners={owners} className={styles.owner} />
      </div>
      {showPutdown && (
        <p className={styles.putdown}>Putdown {formatTimeForDisplay(putdownTime)}</p>
      )}
    </article>
  );
}
