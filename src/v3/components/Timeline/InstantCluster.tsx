"use client";

import styles from "@/components/Timeline/InstantCluster.module.css";
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

/**
 * Time-of-day cluster: row of InstantChips with a leader line back to
 * the block lane. Same fan-vs-stack invariant as V2 — chips at the
 * same time MUST fan horizontally and MUST NOT stack vertically.
 */
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
      style={
        {
          top: `${topPx}px`,
          right: `${rightPx}px`,
          width: `${widthPx}px`,
          ["--leader-width" as string]: `${leaderWidthPx}px`,
        } as React.CSSProperties
      }
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
