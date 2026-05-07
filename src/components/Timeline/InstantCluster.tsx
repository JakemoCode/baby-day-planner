"use client";

import type { Event } from "@/domain";
import { InstantChip } from "./InstantChip";
import styles from "./InstantCluster.module.css";

export type InstantClusterProps = {
  /** Events firing at the same time. Rendered as a horizontal fan. */
  items: Event[];
  /** Vertical position (px from timeline origin) for the cluster's center. */
  topPx: number;
  /** Horizontal position (px from left). Caller anchors to gutter origin. */
  leftPx: number;
  /** Container width — caps wrap so chips reflow within the gutter. */
  widthPx: number;
  /** Pixels for the leader line from block lane's right edge. */
  leaderWidthPx: number;
  colorMode: "type" | "owner";
  past: boolean;
  onEventTap?: (event: Event) => void;
};

/**
 * One time-of-day cluster: positions a row of InstantChips with a leader
 * line drawn back to the block lane. Per the V1 handoff, chips at the same
 * time MUST fan horizontally and MUST NOT stack vertically — `flex-direction:
 * row` enforces that structurally. If the chips can't all fit in the gutter
 * width, flex-wrap pushes overflow to a new row but they remain at the same
 * time-of-day cluster (visually a wider band, never disjoint y positions).
 */
export function InstantCluster({
  items,
  topPx,
  leftPx,
  widthPx,
  leaderWidthPx,
  colorMode,
  past,
  onEventTap,
}: InstantClusterProps) {
  return (
    <div
      data-testid="instant-cluster"
      data-past={past}
      className={styles.cluster}
      style={
        {
          top: `${topPx}px`,
          left: `${leftPx}px`,
          width: `${widthPx}px`,
          // CSS variable consumed by the ::before leader line.
          ["--leader-width" as string]: `${leaderWidthPx}px`,
        } as React.CSSProperties
      }
    >
      {items.map((event) => (
        <InstantChip
          key={event.id}
          event={event}
          colorMode={colorMode}
          {...(onEventTap ? { onClick: () => onEventTap(event) } : {})}
        />
      ))}
    </div>
  );
}
