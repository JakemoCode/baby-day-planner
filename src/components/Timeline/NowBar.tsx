"use client";

import { formatTimeShort } from "@/domain";
import styles from "./NowBar.module.css";

export type NowBarProps = {
  /** Vertical position in px from timeline origin. */
  topPx: number;
  /** Where the block lane begins — left edge of the horizontal line. */
  axisWidthPx: number;
  /** Optional right inset for the line (defaults to 0 = full width to container right). */
  rightPx?: number;
  /** Minutes-since-midnight for the time label. */
  nowMinutes: number;
};

function formatNow(nowMinutes: number): string {
  const h = Math.floor(nowMinutes / 60);
  const m = nowMinutes % 60;
  return formatTimeShort(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
}

/**
 * The "now" indicator: a 2px horizontal line + a colored time pill that
 * sits in the axis lane (left of the line). The pill's right edge stops
 * at axisWidthPx - 2 so it MUST NOT extend into the block lane — that's
 * the §12 anti-requirement that the now pill never covers event content.
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
        style={{
          left: 0,
          width: `${axisWidthPx}px`,
          top: `${topPx - 9}px`,
        }}
      >
        {formatNow(nowMinutes)}
      </div>
    </>
  );
}
