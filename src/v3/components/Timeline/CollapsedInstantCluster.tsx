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

/**
 * §F55 — collapsed render for ≥2 instant events that would overlap
 * vertically on the timeline. One chip shows the count and time range;
 * tap opens a sheet that lists each underlying event.
 *
 * Design choices:
 *   - Stacked colored dots (capped at 4) give a visual hint of how many
 *     events are inside without leaning on text.
 *   - "N events" label keeps the chip's content predictable regardless of
 *     event types/owners inside.
 *   - Same right-gutter geometry as {@link InstantCluster} so collapsed
 *     and normal clusters interleave cleanly on the timeline.
 */
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
  const a11y = `${count} events from ${range}, tap to view`;

  // Cap displayed dots at 4 so the chip width stays bounded. The full
  // list lives in the sheet anyway.
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
          {dotEvents.map((e, i) => (
            <span key={i} className={styles.dot} data-type={e.type} />
          ))}
        </span>
        <span className={styles.body}>
          <span className={styles.topRow}>
            <span className={styles.label}>{count} events</span>
            <span className={styles.time}>{range}</span>
          </span>
          <span className={styles.secondRow}>Tap to view</span>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </button>
    </div>
  );
}
