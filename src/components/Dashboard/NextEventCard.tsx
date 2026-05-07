import type { Event, Owner } from "@/domain";
import { formatTimeForDisplay, parseTime } from "@/domain";
import styles from "./NextEventCard.module.css";

export type NextEventCardProps = {
  event: Event | undefined;
  nowMinutes: number;
  /**
   * For putdown events, the nap/bedtime they precede. Used to append
   * "…at 6:35 PM" so the parent event's time is visible at a glance.
   */
  targetEvent?: Event;
};

const OWNER_CSS: Record<Owner, string> = {
  Jake: styles["owner-jake"] ?? "",
  Kelly: styles["owner-kelly"] ?? "",
  Daycare: styles["owner-daycare"] ?? "",
};

function formatDelta(deltaMinutes: number): { text: string; isNow: boolean } {
  if (deltaMinutes <= 0) return { text: "now", isNow: true };
  if (deltaMinutes < 60) return { text: `in ${deltaMinutes} min`, isNow: false };
  const h = Math.floor(deltaMinutes / 60);
  const m = deltaMinutes % 60;
  return { text: m === 0 ? `in ${h}h` : `in ${h}h ${m}m`, isNow: false };
}

export function NextEventCard({ event, nowMinutes, targetEvent }: NextEventCardProps) {
  if (!event) {
    return (
      <div className={styles.empty} role="status">
        <p>Nothing scheduled — enjoy the quiet.</p>
      </div>
    );
  }

  const eventMinutes = parseTime(event.startTime);
  const delta = formatDelta(eventMinutes - nowMinutes);
  const labelText =
    event.type === "putdown" && targetEvent
      ? `${event.label} at ${formatTimeForDisplay(targetEvent.startTime)}`
      : event.label;

  return (
    <article className={styles.card} aria-label="Next event">
      <p className={styles.heading}>Next event</p>
      <h2 className={styles.label}>{labelText}</h2>
      <div className={styles.timeRow}>
        <span className={styles.time}>{formatTimeForDisplay(event.startTime)}</span>
        <span className={`${styles.delta} ${delta.isNow ? styles.deltaNow : ""}`}>
          {delta.text}
        </span>
        {event.owner && (
          <span className={`${styles.owner} ${OWNER_CSS[event.owner]}`}>{event.owner}</span>
        )}
      </div>
    </article>
  );
}
