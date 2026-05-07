"use client";

import type { Event } from "@/domain";
import { formatTimeForDisplay } from "@/domain";
import styles from "./Block.module.css";

export type BlockProps = {
  event: Event;
  topPx: number;
  heightPx: number;
  /** "type" or "owner" — drives whether fill encodes type or owner. */
  colorMode: "type" | "owner";
  past: boolean;
  onClick?: () => void;
  /**
   * Horizontal positioning rules differ per variant — computed by the
   * parent timeline, applied as inline left/right offsets so the variant
   * logic lives in one place. (TIMELINE_V2_PLAN.md §7.)
   */
  leftPx: number;
  rightPx: number;
};

function formatRange(start: string, end: string): string {
  const s = formatTimeForDisplay(start);
  const e = formatTimeForDisplay(end);
  const sP = s.slice(-2);
  const eP = e.slice(-2);
  if (sP === eP) {
    return `${s.replace(/\s(AM|PM)$/, "")}–${e}`;
  }
  return `${s} – ${e}`;
}

function blockLabel(event: Event): string {
  if (event.type === "putdown") {
    return event.label.replace(/^Start putting down for /, "Putdown · ");
  }
  return event.label;
}

/**
 * One block on the timeline (wake / nap / putdown / extra-with-endTime).
 * Visual variant is data-attribute driven so styling lives in CSS Modules
 * — no inline color math here. The parent supplies absolute geometry
 * (top, height, left, right) so this component is purely presentational.
 */
export function Block({
  event,
  topPx,
  heightPx,
  colorMode,
  past,
  onClick,
  leftPx,
  rightPx,
}: BlockProps) {
  const interactive = !!onClick;
  const Tag = interactive ? "button" : "div";
  const range = event.endTime ? formatRange(event.startTime, event.endTime) : "";
  const a11y = `${event.label}${range ? ` ${range}` : ""}${event.owner ? ` ${event.owner}` : ""}`;

  return (
    <Tag
      data-testid="timeline-block"
      data-type={event.type}
      data-color-mode={colorMode}
      data-past={past}
      data-static={!interactive}
      {...(event.owner ? { "data-owner": event.owner } : {})}
      className={styles.block}
      style={{
        top: `${topPx}px`,
        height: `${heightPx}px`,
        left: `${leftPx}px`,
        right: `${rightPx}px`,
      }}
      {...(interactive
        ? { type: "button" as const, onClick, "aria-label": a11y }
        : { role: "presentation" as const })}
    >
      {/* Custom blocks get visible 1px start/end edge markers (§11.B). */}
      {event.type === "extra" && (
        <>
          <span className={styles.markerLine} data-edge="top" aria-hidden="true" />
          <span className={styles.markerLine} data-edge="bottom" aria-hidden="true" />
        </>
      )}
      <span className={styles.label}>
        {blockLabel(event)}
        {/* Putdown blocks are ~30px tall — owner inline with the label
         * keeps them single-row legible against the diagonal stripes.
         * Other blocks render owner in the range row below. */}
        {event.type === "putdown" && event.owner && (
          <span className={styles.owner} data-owner={event.owner}>
            · {event.owner}
          </span>
        )}
      </span>
      {/* Range row is dropped for putdown blocks (too tall for ~30px height,
       * and the time is already conveyed by the block's geometry — last
       * 15min of its parent wake window). */}
      {range && event.type !== "putdown" && (
        <span className={styles.range}>
          {range}
          {event.owner && (
            <span className={styles.owner} data-owner={event.owner}>
              · {event.owner}
            </span>
          )}
        </span>
      )}
    </Tag>
  );
}
