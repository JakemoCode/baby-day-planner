"use client";

import type { Event } from "@/domain";
import { formatTimeForDisplay, parseTime } from "@/domain";
import styles from "./PointMarker.module.css";

export type PointMarkerProps = {
  event: Event;
  topPx: number;
  onClick?: () => void;
  /**
   * Compact rendering used when the marker is embedded inside a DurationBlock:
   * drops the left time gutter and inlines the time with the label so multiple
   * markers fit cleanly inside a parent card.
   */
  compact?: boolean;
};

function buildSubtitle(event: Event): string {
  const parts: string[] = [];
  if (event.type === "bottle" && event.amountOz != null) {
    parts.push(`${event.amountOz} oz`);
  }
  if (event.owner) {
    parts.push(event.owner);
  }
  return parts.join(" · ");
}

/**
 * Engine emits long, conversational putdown labels ("Start putting down for
 * Bedtime"). Inside a compact chip we have ~half the horizontal space, so
 * trim down to the essential "Putdown · {target}".
 */
function chipLabel(event: Event): string {
  if (event.type === "putdown") {
    return event.label.replace(/^Start putting down for /, "Putdown · ");
  }
  return event.label;
}

export function PointMarker({ event, topPx, onClick, compact = false }: PointMarkerProps) {
  const interactive = !!onClick;
  const Tag = interactive ? "button" : "div";
  const subtitle = buildSubtitle(event);
  const time = formatTimeForDisplay(event.startTime);
  const visibleLabel = compact ? chipLabel(event) : event.label;
  const accessibleName = `${event.label} at ${time}${subtitle ? `, ${subtitle}` : ""}`;
  // On-the-hour events get their time announced by the adjacent hour tick;
  // showing it inside the marker too is noisy redundancy.
  const isOnHour = parseTime(event.startTime) % 60 === 0;
  const showTime = !isOnHour;

  return (
    <Tag
      data-testid="point-marker"
      data-event-type={event.type}
      data-source={event.source}
      data-static={!interactive}
      data-compact={compact}
      className={compact ? styles.markerCompact : styles.marker}
      style={{ top: `${topPx}px` }}
      {...(interactive
        ? { type: "button" as const, onClick, "aria-label": accessibleName }
        : { role: "presentation" as const })}
    >
      {!compact && showTime && <span className={styles.time}>{time}</span>}
      {!compact && !showTime && <span className={styles.time} aria-hidden="true" />}
      <span className={styles.body}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.label}>{visibleLabel}</span>
        {!compact && subtitle && <span className={styles.subtitle}>· {subtitle}</span>}
        {event.status === "overridden" && (
          <span className={styles.editMark} aria-label="edited">
            ✎
          </span>
        )}
      </span>
      {compact && showTime && <span className={styles.compactTime}>{time}</span>}
    </Tag>
  );
}
