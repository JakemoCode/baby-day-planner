"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "./InstantChip.module.css";
import type { Event, OwnersConfig } from "../../schemas";
import { formatTimeShort } from "../../ui/time";
import { ownerColor, ownerDisplayName } from "../../ui/owners";
import { ownerStyleVar } from "../../ui/ownerStyle";
import { ownerSlotKey } from "./ownerSlotKey";

export type InstantChipProps = {
  event: Event;
  owners: OwnersConfig;
  colorMode: "type" | "owner";
  onClick?: () => void;
};

/** Returns the chip display label: bedtime→"Bed", pump→"Pump", daycare→arrow variants, others use event.label. */
function chipText(event: Event): string {
  if (event.type === "bedtime") return "Bed";
  if (event.type === "pump") return event.label.startsWith("Pump") ? event.label : "Pump";
  if (event.type === "daycare_dropoff") return "Daycare ↓";
  if (event.type === "daycare_pickup") return "Daycare ↑";
  return event.label;
}

type ChipContentProps = {
  label: string;
  time: string;
  ownerName: string | null;
  slotKey: string | null;
  TagAttrs: {
    Tag: "button" | "span";
    interactiveProps: Record<string, unknown>;
    staticAttr: boolean;
    eventType: string;
    colorMode: "type" | "owner";
    style: React.CSSProperties | undefined;
    dataOwner: Record<string, string>;
  };
};

/**
 * §F2b — two-row layout: unwrapped shows [label time]/[owner]; wrapped shows [label]/[time · owner].
 * Keyed by (label|time) for fresh state on content change. ResizeObserver resets to re-test at new width.
 */
function ChipContent({ label, time, ownerName, slotKey, TagAttrs }: ChipContentProps): ReactNode {
  const { Tag, interactiveProps, staticAttr, eventType, colorMode, style, dataOwner } = TagAttrs;
  const chipRef = useRef<HTMLElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const [wrapped, setWrapped] = useState(false);

  useLayoutEffect(() => {
    if (wrapped) return;
    const el = labelRef.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth + 0.5) {
      setWrapped(true);
    }
  }, [wrapped]);

  useEffect(() => {
    const el = chipRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWrapped(false));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <Tag
      ref={chipRef as never}
      data-testid="instant-chip"
      data-type={eventType}
      data-color-mode={colorMode}
      data-static={staticAttr}
      data-wrapped={wrapped}
      className={styles.chip}
      style={style}
      {...dataOwner}
      {...interactiveProps}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.body}>
        <span className={styles.topRow}>
          <span ref={labelRef} className={styles.label}>
            {label}
          </span>
          {!wrapped && <span className={styles.time}>{time}</span>}
        </span>
        {(wrapped || ownerName) && (
          <span className={styles.secondRow}>
            {wrapped && <span className={styles.time}>{time}</span>}
            {ownerName && (
              <span className={styles.ownerName} {...(slotKey ? { "data-owner": slotKey } : {})}>
                {ownerName}
              </span>
            )}
          </span>
        )}
      </span>
    </Tag>
  );
}

export function InstantChip({ event, owners, colorMode, onClick }: InstantChipProps) {
  const interactive = !!onClick;
  const Tag: "button" | "span" = interactive ? "button" : "span";
  const time = formatTimeShort(event.startTime);
  const label = chipText(event);
  const ownerName = ownerDisplayName(event.owner, owners);
  const slotKey = ownerSlotKey(event.owner);
  const a11y = `${event.label} at ${time}${ownerName ? ` ${ownerName}` : ""}`;

  const interactiveProps: Record<string, unknown> = interactive
    ? { type: "button" as const, onClick, "aria-label": a11y }
    : { role: "presentation" as const };

  const dataOwner = slotKey ? { "data-owner": slotKey } : {};

  return (
    <ChipContent
      key={`${label}|${time}`}
      label={label}
      time={time}
      ownerName={ownerName}
      slotKey={slotKey}
      TagAttrs={{
        Tag,
        interactiveProps,
        staticAttr: !interactive,
        eventType: event.type,
        colorMode,
        style: ownerStyleVar(ownerColor(event.owner, owners)),
        dataOwner,
      }}
    />
  );
}
