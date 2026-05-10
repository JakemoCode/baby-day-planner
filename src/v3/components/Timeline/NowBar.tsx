"use client";

import styles from "./NowBar.module.css";
import type { TimeMin } from "../../schemas";
import { formatTimeForDisplay } from "../../ui/time";

export type NowBarProps = {
  topPx: number;
  axisWidthPx: number;
  rightPx?: number;
  nowMinutes: TimeMin;
};

/**
 * "Now" indicator: 2px horizontal line + colored time pill in the axis
 * lane (left of the line). Pill MUST NOT extend into the block lane —
 * §12 anti-requirement that the pill never covers event content.
 */
export function NowBar({ topPx, axisWidthPx, rightPx = 0, nowMinutes }: NowBarProps) {
  return (
    <>
      <div
        data-testid="now-line"
        className={styles.line}
        style={{ left: `${axisWidthPx}px`, right: `${rightPx}px`, top: `${topPx}px` }}
      />
      <div
        data-testid="now-pill"
        className={styles.pill}
        style={{ left: 0, top: `${topPx - 9}px` }}
      >
        {formatTimeForDisplay(nowMinutes)}
      </div>
    </>
  );
}
