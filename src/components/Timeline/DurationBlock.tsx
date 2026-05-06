"use client";

import type { Event } from "@/domain";
import { formatTimeForDisplay } from "@/domain";
import styles from "./DurationBlock.module.css";

export type DurationBlockProps = {
  event: Event;
  topPx: number;
  heightPx: number;
  onClick?: () => void;
};

function formatRange(start: string, end: string): string {
  const startStr = formatTimeForDisplay(start);
  const endStr = formatTimeForDisplay(end);
  const startPeriod = startStr.slice(-2);
  const endPeriod = endStr.slice(-2);
  if (startPeriod === endPeriod) {
    return `${startStr.replace(/\s(AM|PM)$/, "")}–${endStr}`;
  }
  return `${startStr} – ${endStr}`;
}

export function DurationBlock({ event, topPx, heightPx, onClick }: DurationBlockProps) {
  const interactive = !!onClick;
  const Tag = interactive ? "button" : "div";
  const range = event.endTime ? formatRange(event.startTime, event.endTime) : "";

  const accessibleName = `${event.label} ${range}${event.owner ? ` ${event.owner}` : ""}`;

  return (
    <Tag
      data-testid="duration-block"
      data-event-type={event.type}
      data-source={event.source}
      data-static={!interactive}
      {...(event.owner ? { "data-owner": event.owner } : {})}
      className={styles.block}
      style={{ top: `${topPx}px`, height: `${heightPx}px` }}
      {...(interactive
        ? { type: "button" as const, onClick, "aria-label": accessibleName }
        : { role: "presentation" as const })}
    >
      <span className={styles.label}>{event.label}</span>
      <div className={styles.range}>
        <span>{range}</span>
        {event.owner && <span className={styles.owner}>· {event.owner}</span>}
        {event.status === "overridden" && (
          <span className={styles.editMark} aria-label="edited">
            ✎
          </span>
        )}
      </div>
    </Tag>
  );
}
