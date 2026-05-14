"use client";

import styles from "./Block.module.css";
import type { Event, OwnersConfig } from "../../schemas";
import { formatTimeForDisplay, formatTimeShort } from "../../ui/time";
import { ownerColor, ownerDisplayName } from "../../ui/owners";
import { ownerStyleVar } from "../../ui/ownerStyle";
import { PUTDOWN_KIND_TAG } from "./expandPutdown";
import { ownerSlotKey } from "./ownerSlotKey";

const NAP_TWO_ROW_THRESHOLD_PX = 50;

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

function formatRange(start: number, end: number): string {
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
  const range = event.endTime !== undefined ? formatRange(event.startTime, event.endTime) : "";
  const ownerName = ownerDisplayName(event.owner, owners);
  const ownerColorValue = ownerColor(event.owner, owners);
  const slotKey = ownerSlotKey(event.owner);
  const a11y = `${event.label}${range ? ` ${range}` : ""}${ownerName ? ` ${ownerName}` : ""}`;
  const napShortForm = event.type === "nap" && heightPx < NAP_TWO_ROW_THRESHOLD_PX;
  const isPutdown = event.eventKey === PUTDOWN_KIND_TAG;
  // Reuse V2's "putdown" data-type so the existing CSS selectors apply.
  // V3 doesn't have a putdown type at the schema level; this is the
  // renderer's contract with the stylesheet, not with the data model.
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
        left: `${leftPx}px`,
        right: `${rightPx}px`,
        ...ownerStyleVar(ownerColorValue),
      }}
      {...(interactive
        ? { type: "button" as const, onClick, "aria-label": a11y }
        : { role: "presentation" as const })}
    >
      {(event.type === "extra" || event.type === "pump") && (
        <>
          <span className={styles.markerLine} data-edge="top" aria-hidden="true" />
          <span className={styles.markerLine} data-edge="bottom" aria-hidden="true" />
        </>
      )}
      <span className={styles.label}>
        {blockLabel(event)}
        {isPutdown && (
          <>
            <span className={styles.inlineTime}> · {formatTimeShort(event.startTime)}</span>
            {ownerName && (
              <span className={styles.owner} {...(slotKey ? { "data-owner": slotKey } : {})}>
                · {ownerName}
              </span>
            )}
          </>
        )}
        {napShortForm && ownerName && (
          <span className={styles.owner} {...(slotKey ? { "data-owner": slotKey } : {})}>
            · {ownerName}
          </span>
        )}
      </span>
      {range && !isPutdown && !napShortForm && (
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
