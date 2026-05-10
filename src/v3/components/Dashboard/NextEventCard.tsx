import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { formatTimeForDisplay } from "@/v3/ui/time";
import { ownerColor, ownerDisplayName } from "@/v3/ui/owners";
import styles from "./NextEventCard.module.css";

export type NextEventCardProps = {
  event: Event | undefined;
  nowMinutes: TimeMin;
  owners: OwnersConfig;
};

function formatDelta(deltaMinutes: number): { text: string; isNow: boolean } {
  if (deltaMinutes <= 0) return { text: "now", isNow: true };
  if (deltaMinutes < 60) return { text: `in ${deltaMinutes} min`, isNow: false };
  const h = Math.floor(deltaMinutes / 60);
  const m = deltaMinutes % 60;
  return { text: m === 0 ? `in ${h}h` : `in ${h}h ${m}m`, isNow: false };
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
  const ownerName = ownerDisplayName(event.owner, owners);
  const color = ownerColor(event.owner, owners);
  const ownerStyle = color ? ({ "--owner-color": color } as React.CSSProperties) : undefined;

  return (
    <article className={styles.card} aria-label="Next event">
      <p className={styles.heading}>Next event</p>
      <h2 className={styles.label}>{event.label}</h2>
      <div className={styles.timeRow}>
        <span className={styles.time}>{formatTimeForDisplay(event.startTime)}</span>
        <span className={`${styles.delta} ${delta.isNow ? styles.deltaNow : ""}`}>
          {delta.text}
        </span>
        {ownerName && (
          <span className={styles.owner} style={ownerStyle}>
            {ownerName}
          </span>
        )}
      </div>
    </article>
  );
}
