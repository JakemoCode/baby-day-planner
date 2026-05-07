"use client";

import type { Event } from "@/domain";
import { diffMinutes, formatTimeForDisplay, formatTimeShort } from "@/domain";
import styles from "./Block.module.css";

/** Below this block height, drop the range row and inline owner with the
 *  label so a short nap stays single-row legible. Sized so two rows of
 *  text-sm + text-xs (≈ 14 + 12 + line-heights + padding ≈ 38-44px) don't
 *  fit; below that we collapse. */
const NAP_TWO_ROW_THRESHOLD_PX = 50;

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
  // Naps show their duration inline so users can read length at a glance:
  // "Nap 2 (42 min)". When the actual nap hasn't ended yet (no endTime),
  // omit the duration — there's nothing to measure.
  if (event.type === "nap" && event.endTime) {
    const mins = diffMinutes(event.endTime, event.startTime);
    if (mins > 0) return `${event.label} (${mins} min)`;
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
  // Short naps collapse to a single-row layout (label + owner inline) so the
  // text doesn't get clipped against the next block. Other block types
  // already handle their own short-form rules (putdown is always single-row,
  // wake_window has more vertical room by design).
  const napShortForm = event.type === "nap" && heightPx < NAP_TWO_ROW_THRESHOLD_PX;

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
        {/* Putdown blocks are single-row — append the start time inline
         * (in compact form so it doesn't crowd the label) and the owner. */}
        {event.type === "putdown" && (
          <>
            <span className={styles.inlineTime}> {formatTimeShort(event.startTime)}</span>
            {event.owner && (
              <span className={styles.owner} data-owner={event.owner}>
                · {event.owner}
              </span>
            )}
          </>
        )}
        {/* Short naps: inline owner with the label so the block's content
         * fits in a single row. Range is dropped (the duration in parens
         * after "Nap 2" already conveys length). */}
        {napShortForm && event.owner && (
          <span className={styles.owner} data-owner={event.owner}>
            · {event.owner}
          </span>
        )}
      </span>
      {/* Range row dropped for: putdown (too short, time is implicit), and
       * short naps (the (N min) suffix on the label conveys duration). */}
      {range && event.type !== "putdown" && !napShortForm && (
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
