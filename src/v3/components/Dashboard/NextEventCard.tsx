import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { formatHoursMinutes, formatTimeForDisplay } from "@/v3/ui/time";
import { OwnerPill } from "./OwnerPill";
import styles from "./NextEventCard.module.css";

export type NextEventCardProps = {
  event: Event | undefined;
  nowMinutes: TimeMin;
  owners: OwnersConfig;
};

function formatDelta(deltaMinutes: number): { text: string; isNow: boolean } {
  if (deltaMinutes <= 0) return { text: "now", isNow: true };
  return { text: formatHoursMinutes(deltaMinutes, { prefix: "in " }), isNow: false };
}

export function NextEventCard({ event, nowMinutes, owners }: NextEventCardProps) {
  if (!event) {
    return (
      <div className={styles.empty} role="status">
        <p>Nothing scheduled — enjoy the quiet.</p>
      </div>
    );
  }

  const delta = formatDelta(event.startTime - nowMinutes);

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
    </article>
  );
}
