"use client";

import styles from "./GroupedEventsSheet.module.css";
import { BottomSheet } from "@/components/shared/BottomSheet";
import type { Event, OwnersConfig, TimeMin } from "../../schemas";
import { formatTimeShort } from "../../ui/time";
import { ownerColor, ownerDisplayName } from "../../ui/owners";
import { ownerStyleVar } from "../../ui/ownerStyle";

export type GroupedEventsSheetProps = {
  open: boolean;
  items: Event[];
  startMinutes: TimeMin;
  endMinutes: TimeMin;
  owners: OwnersConfig;
  onCancel: () => void;
  /** Invoked when the user taps an event row. Caller routes to the edit drawer. */
  onTapEvent: (event: Event) => void;
};

/**
 * §F55 — list-sheet companion to {@link CollapsedInstantCluster}. Opens
 * when the user taps a "N events" chip and lists the underlying events
 * as tappable rows. Each row routes to the same `onEventTap` the parent
 * timeline already wires for normal chips.
 */
export function GroupedEventsSheet({
  open,
  items,
  startMinutes,
  endMinutes,
  owners,
  onCancel,
  onTapEvent,
}: GroupedEventsSheetProps) {
  const rangeLabel =
    startMinutes === endMinutes
      ? formatTimeShort(startMinutes)
      : `${formatTimeShort(startMinutes)}–${formatTimeShort(endMinutes)}`;

  return (
    <BottomSheet open={open} title={`Events at ${rangeLabel}`} onCancel={onCancel}>
      <ul className={styles.list}>
        {items.map((event) => {
          const ownerName = ownerDisplayName(event.owner, owners);
          const ownerHex = ownerColor(event.owner, owners);
          return (
            <li key={event.id} className={styles.row}>
              <button
                type="button"
                className={styles.rowButton}
                onClick={() => onTapEvent(event)}
                style={ownerStyleVar(ownerHex)}
              >
                <span className={styles.dot} data-type={event.type} aria-hidden="true" />
                <span className={styles.body}>
                  <span className={styles.label}>{event.label}</span>
                  <span className={styles.meta}>
                    {formatTimeShort(event.startTime)}
                    {ownerName ? (
                      <>
                        {" · "}
                        <span className={styles.owner}>{ownerName}</span>
                      </>
                    ) : null}
                  </span>
                </span>
                <span className={styles.chevron} aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
