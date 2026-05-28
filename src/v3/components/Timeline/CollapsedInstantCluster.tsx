"use client";

import styles from "./CollapsedInstantCluster.module.css";
import type { Event, TimeMin } from "../../schemas";
import { formatTimeShort } from "../../ui/time";

export type CollapsedInstantClusterProps = {
  /** The events that collapsed into this cluster (>= 2). */
  items: Event[];
  /** Earliest startTime among members — anchors the time-range label. */
  startMinutes: TimeMin;
  /** Latest startTime among members — closes the time-range label. */
  endMinutes: TimeMin;
  topPx: number;
  rightPx: number;
  widthPx: number;
  leaderWidthPx: number;
  past: boolean;
  onTap: () => void;
};

/** §F55 — collapsed chip for ≥2 overlapping instants; tap opens a sheet listing each event. */
export function CollapsedInstantCluster({
  items,
  startMinutes,
  endMinutes,
  topPx,
  rightPx,
  widthPx,
  leaderWidthPx,
  past,
  onTap,
}: CollapsedInstantClusterProps) {
  const count = items.length;
  const range =
    startMinutes === endMinutes
      ? formatTimeShort(startMinutes)
      : `${formatTimeShort(startMinutes)}–${formatTimeShort(endMinutes)}`;
  const preposition = startMinutes === endMinutes ? "at" : "from";
  const a11y = `${count} events ${preposition} ${range}, tap to view`;

  // Cap dots at 4 to bound chip width; full list in the sheet.
  const dotEvents = items.slice(0, 4);

  return (
    <div
      data-testid="collapsed-instant-cluster"
      data-past={past}
      className={styles.cluster}
      style={{
        top: `${topPx}px`,
        right: `${rightPx}px`,
        width: `${widthPx}px`,
        "--leader-width": `${leaderWidthPx}px`,
      }}
    >
      <button type="button" className={styles.chip} onClick={onTap} aria-label={a11y}>
        <span className={styles.dotStack} aria-hidden="true">
          {dotEvents.map((e) => (
            <span key={e.id} className={styles.dot} data-type={e.type} />
          ))}
        </span>
        <span className={styles.body}>
          <span className={styles.label}>{count} events</span>
          <span className={styles.time}>{range}</span>
          <span className={styles.hint}>Tap to view</span>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </button>
    </div>
  );
}
