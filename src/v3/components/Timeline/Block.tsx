"use client";

import styles from "./Block.module.css";
import type { Event, OwnersConfig } from "../../schemas";
import { formatRangeShort, formatTimeForDisplay, formatTimeShort } from "../../ui/time";
import { ownerColor, ownerDisplayName } from "../../ui/owners";
import { ownerStyleVar } from "../../ui/ownerStyle";
import { PUTDOWN_KIND_TAG } from "./expandPutdown";
import { ownerSlotKey } from "./ownerSlotKey";

const NAP_TWO_ROW_THRESHOLD_PX = 50;
// §F53: extra-with-duration renders as a fixed-width band whose LEFT edge sits
// on the column break (cascade blocks' right edge). TimelineV3 sets the right
// offset so the left edge lands on the break; this width must match the
// EXTRA_BAND_WIDTH_PX there (6px gutter + 68px body + 6px gutter).
const EXTRA_BAND_WIDTH_PX = 80;

export type BlockProps = {
  event: Event;
  topPx: number;
  heightPx: number;
  owners: OwnersConfig;
  colorMode: "type" | "owner";
  past: boolean;
  onClick?: () => void;
  leftPx: number;
  rightPx: number;
};

/** Full-length range string for screen readers; timeline shows compact form. */
function formatRangeVerbose(start: number, end: number): string {
  return `${formatTimeForDisplay(start)} to ${formatTimeForDisplay(end)}`;
}

function blockLabel(event: Event): string {
  if (event.eventKey === PUTDOWN_KIND_TAG) return "Putdown";
  if (event.type === "nap" && event.endTime !== undefined) {
    const mins = event.endTime - event.startTime;
    if (mins > 0) return `${event.label} (${mins} min)`;
  }
  return event.label;
}

export function Block({
  event,
  topPx,
  heightPx,
  owners,
  colorMode,
  past,
  onClick,
  leftPx,
  rightPx,
}: BlockProps) {
  const interactive = !!onClick;
  const Tag = interactive ? "button" : "div";
  const range = event.endTime !== undefined ? formatRangeShort(event.startTime, event.endTime) : "";
  const ownerName = ownerDisplayName(event.owner, owners);
  const ownerColorValue = ownerColor(event.owner, owners);
  const slotKey = ownerSlotKey(event.owner);
  const rangeA11y =
    event.endTime !== undefined ? formatRangeVerbose(event.startTime, event.endTime) : "";
  const a11y = `${event.label}${rangeA11y ? ` ${rangeA11y}` : ""}${ownerName ? ` ${ownerName}` : ""}`;
  const napShortForm = event.type === "nap" && heightPx < NAP_TWO_ROW_THRESHOLD_PX;
  const isPutdown = event.eventKey === PUTDOWN_KIND_TAG;
  // Pump owner conveyed by left-stripe color, not text; sized to max-content and inset from parent.
  const isPump = event.type === "pump";
  // §F53: extra-with-duration is a fixed-width band right-aligned in the instant column.
  const isExtra = event.type === "extra";
  const positionStyle = isPump
    ? { right: `${rightPx}px`, width: "max-content" as const }
    : isExtra
      ? { right: `${rightPx}px`, width: `${EXTRA_BAND_WIDTH_PX}px` }
      : { left: `${leftPx}px`, right: `${rightPx}px` };
  // "putdown" data-type reuses V2 stylesheet selectors; not a schema type.
  const dataType = isPutdown ? "putdown" : event.type;

  return (
    <Tag
      data-testid="timeline-block"
      data-type={dataType}
      data-color-mode={colorMode}
      data-past={past}
      data-static={!interactive}
      {...(slotKey ? { "data-owner": slotKey } : {})}
      className={styles.block}
      style={{
        top: `${topPx}px`,
        height: `${heightPx}px`,
        ...positionStyle,
        ...ownerStyleVar(ownerColorValue),
      }}
      {...(interactive
        ? { type: "button" as const, onClick, "aria-label": a11y }
        : { role: "presentation" as const })}
    >
      {event.type === "extra" && (
        <>
          <span className={styles.markerLine} data-edge="top" aria-hidden="true" />
          <span className={styles.markerLine} data-edge="bottom" aria-hidden="true" />
        </>
      )}
      <span className={styles.label}>
        {blockLabel(event)}
        {isPutdown && (
          <span className={styles.inlineTime}> · {formatTimeShort(event.startTime)}</span>
        )}
        {napShortForm && !isPutdown && ownerName && (
          <span className={styles.owner} {...(slotKey ? { "data-owner": slotKey } : {})}>
            · {ownerName}
          </span>
        )}
      </span>
      {isPump && range && <span className={styles.range}>{range}</span>}
      {range && !isPutdown && !napShortForm && !isPump && (
        <span className={styles.range}>
          {range}
          {ownerName && (
            <span className={styles.owner} {...(slotKey ? { "data-owner": slotKey } : {})}>
              · {ownerName}
            </span>
          )}
        </span>
      )}
    </Tag>
  );
}
