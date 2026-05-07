"use client";

import { useMemo } from "react";
import type { Event } from "@/domain";
import { formatTimeForDisplay, parseTime } from "@/domain";
import { CurrentTimeIndicator } from "@/components/shared/CurrentTimeIndicator";
import { DurationBlock } from "./DurationBlock";
import { PointMarker } from "./PointMarker";
import styles from "./TimelineList.module.css";

export type TimelineListProps = {
  events: Event[];
  nowMinutes?: number;
  onEventTap?: (event: Event) => void;
};

const PX_PER_MIN = 2;
const VIEWPORT_PADDING_MIN = 30;
const MIN_BLOCK_HEIGHT = 32;
const DEFAULT_VIEWPORT = { start: 7 * 60, end: 21 * 60 };
/** Events whose start times fall within this many minutes of each other are
 *  considered "the same slot" and stacked vertically instead of overlapping. */
const STACK_TOLERANCE_MIN = 5;
/** Vertical offset applied per stack position (≈ a PointMarker's height). */
const STACK_OFFSET_PX = 32;

type BlockEvent = Event & { endTime: string };
const isDurationEvent = (e: Event): e is BlockEvent =>
  (e.type === "nap" || e.type === "wake_window" || e.type === "extra") && e.endTime !== undefined;

export function TimelineList({ events, nowMinutes, onEventTap }: TimelineListProps) {
  const { sorted, originMinutes, heightPx, stackOffsetById } = useMemo(() => {
    if (events.length === 0) {
      return {
        sorted: [] as Event[],
        originMinutes: 0,
        heightPx: 0,
        stackOffsetById: new Map<string, number>(),
      };
    }

    const sortedEvents = [...events].sort(
      (a, b) => parseTime(a.startTime) - parseTime(b.startTime),
    );

    // Bucket events that start within STACK_TOLERANCE_MIN of one another and
    // assign each a vertical "lane" so they don't render on top of each other.
    const offsets = new Map<string, number>();
    let bucketAnchor = -Infinity;
    let bucketIndex = 0;
    for (const e of sortedEvents) {
      const min = parseTime(e.startTime);
      if (min - bucketAnchor <= STACK_TOLERANCE_MIN) {
        bucketIndex += 1;
      } else {
        bucketAnchor = min;
        bucketIndex = 0;
      }
      offsets.set(e.id, bucketIndex * STACK_OFFSET_PX);
    }

    const startTimes = sortedEvents.map((e) => parseTime(e.startTime));
    const endTimes = sortedEvents.map((e) =>
      e.endTime ? parseTime(e.endTime) : parseTime(e.startTime),
    );
    const minMin = Math.min(...startTimes, DEFAULT_VIEWPORT.start);
    const maxMin = Math.max(...endTimes, DEFAULT_VIEWPORT.end);

    const origin = Math.max(0, minMin - VIEWPORT_PADDING_MIN);
    const end = maxMin + VIEWPORT_PADDING_MIN;
    const baseHeight = (end - origin) * PX_PER_MIN;
    const maxStackOffset = Math.max(0, ...offsets.values());

    return {
      sorted: sortedEvents,
      originMinutes: origin,
      heightPx: baseHeight + maxStackOffset,
      stackOffsetById: offsets,
    };
  }, [events]);

  if (events.length === 0) {
    return (
      <div className={styles.empty} role="status">
        Nothing scheduled yet.
      </div>
    );
  }

  return (
    <div className={styles.list} style={{ height: `${heightPx}px` }}>
      {sorted.map((event) => {
        const startMin = parseTime(event.startTime);
        const baseTopPx = (startMin - originMinutes) * PX_PER_MIN;
        const topPx = baseTopPx + (stackOffsetById.get(event.id) ?? 0);
        const tap = onEventTap ? () => onEventTap(event) : undefined;

        if (isDurationEvent(event)) {
          const endMin = parseTime(event.endTime);
          const blockHeight = Math.max(MIN_BLOCK_HEIGHT, (endMin - startMin) * PX_PER_MIN);
          return (
            <DurationBlock
              key={event.id}
              event={event}
              topPx={topPx}
              heightPx={blockHeight}
              {...(tap ? { onClick: tap } : {})}
            />
          );
        }

        return (
          <PointMarker
            key={event.id}
            event={event}
            topPx={topPx}
            {...(tap ? { onClick: tap } : {})}
          />
        );
      })}

      {nowMinutes !== undefined && (
        <CurrentTimeIndicator
          topPx={(nowMinutes - originMinutes) * PX_PER_MIN}
          timeLabel={formatTimeForDisplay(
            `${String(Math.floor(nowMinutes / 60)).padStart(2, "0")}:${String(nowMinutes % 60).padStart(2, "0")}`,
          )}
        />
      )}
    </div>
  );
}
