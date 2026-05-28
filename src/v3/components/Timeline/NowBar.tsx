"use client";

import styles from "./NowBar.module.css";
import type { TimeMin } from "../../schemas";
import { formatTimeShort } from "../../ui/time";

export type NowBarProps = {
  topPx: number;
  axisWidthPx: number;
  rightPx?: number;
  nowMinutes: TimeMin;
};

/** "Now" line + axis-lane time pill. Pill must not extend into the block lane (§12). */
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
        {formatTimeShort(nowMinutes)}
      </div>
    </>
  );
}
