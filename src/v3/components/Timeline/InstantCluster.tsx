"use client";

import styles from "./InstantCluster.module.css";
import type { Event, OwnersConfig } from "../../schemas";
import { InstantChip } from "./InstantChip";

export type InstantClusterProps = {
  items: Event[];
  topPx: number;
  rightPx: number;
  widthPx: number;
  leaderWidthPx: number;
  owners: OwnersConfig;
  colorMode: "type" | "owner";
  past: boolean;
  onEventTap?: (event: Event) => void;
};

/** Row of InstantChips for a single time, with a leader line to the block lane. Chips fan horizontally, never stack. */
export function InstantCluster({
  items,
  topPx,
  rightPx,
  widthPx,
  leaderWidthPx,
  owners,
  colorMode,
  past,
  onEventTap,
}: InstantClusterProps) {
  return (
    <div
      data-testid="instant-cluster"
      data-past={past}
      className={styles.cluster}
      style={{
        top: `${topPx}px`,
        right: `${rightPx}px`,
        width: `${widthPx}px`,
        "--leader-width": `${leaderWidthPx}px`,
      }}
    >
      {items.map((event) => (
        <InstantChip
          key={event.id}
          event={event}
          owners={owners}
          colorMode={colorMode}
          {...(onEventTap ? { onClick: () => onEventTap(event) } : {})}
        />
      ))}
    </div>
  );
}
