"use client";

import { useEffect, useMemo, useRef } from "react";
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
  /**
   * One-shot scroll on mount to bring the current time (or the event in
   * progress) into view. Off by default; the Timeline page opts in.
   */
  scrollToNowOnMount?: boolean;
};

const PX_PER_MIN = 2;
const VIEWPORT_PADDING_MIN = 30;
const MIN_BLOCK_HEIGHT = 32;
/** Vertical space inside a block reserved for label + range row. */
const BLOCK_HEADER_PX = 44;
/** Vertical step between stacked chips inside a block. */
const CHIP_STEP_PX = 28;
/** Padding above the current time when auto-scrolling so context is visible. */
const SCROLL_TOP_PADDING_PX = 80;
const DEFAULT_VIEWPORT = { start: 7 * 60, end: 21 * 60 };

type BlockEvent = Event & { endTime: string };
const isDurationEvent = (e: Event): e is BlockEvent =>
  (e.type === "nap" || e.type === "wake_window" || e.type === "extra") && e.endTime !== undefined;

type Position = { topPx: number; heightPx: number; embeddedIn?: string };

export function TimelineList({
  events,
  nowMinutes,
  onEventTap,
  scrollToNowOnMount = false,
}: TimelineListProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const { sorted, originMinutes, heightPx, positionById } = useMemo(() => {
    if (events.length === 0) {
      return {
        sorted: [] as Event[],
        originMinutes: 0,
        heightPx: 0,
        positionById: new Map<string, Position>(),
      };
    }

    const allBlocks = events.filter(isDurationEvent);
    // Wake events always coincide with the start of Wake Window 1, so a
    // chip for them is pure redundancy. Drop them from the timeline.
    const filtered = events.filter((e) => {
      if (e.type !== "wake") return true;
      return !allBlocks.some((b) => b.startTime === e.startTime);
    });
    const sortedEvents = [...filtered].sort(
      (a, b) => parseTime(a.startTime) - parseTime(b.startTime),
    );

    const startTimes = sortedEvents.map((e) => parseTime(e.startTime));
    const endTimes = sortedEvents.map((e) =>
      e.endTime ? parseTime(e.endTime) : parseTime(e.startTime),
    );
    const minMin = Math.min(...startTimes, DEFAULT_VIEWPORT.start);
    const maxMin = Math.max(...endTimes, DEFAULT_VIEWPORT.end);
    const origin = Math.max(0, minMin - VIEWPORT_PADDING_MIN);

    // Time axis stays absolute. Each block sits at its natural y. Point
    // markers contained by a block become "chips" stacked inside that block,
    // not separate rows on the timeline. Free-standing point markers render
    // normally at their time-anchored y.
    const blocks = sortedEvents.filter(isDurationEvent);
    const positions = new Map<string, Position>();
    const chipCountByBlock = new Map<string, number>();

    for (const e of sortedEvents) {
      const startMin = parseTime(e.startTime);
      const naturalTop = (startMin - origin) * PX_PER_MIN;

      if (isDurationEvent(e)) {
        const blockHeight = Math.max(
          MIN_BLOCK_HEIGHT,
          (parseTime(e.endTime) - startMin) * PX_PER_MIN,
        );
        positions.set(e.id, { topPx: naturalTop, heightPx: blockHeight });
        continue;
      }

      // Point marker — does it fall inside any block's time range?
      const container = blocks.find((b) => {
        const bs = parseTime(b.startTime);
        const be = parseTime(b.endTime);
        return bs <= startMin && startMin < be;
      });

      if (container) {
        const chipIndex = chipCountByBlock.get(container.id) ?? 0;
        chipCountByBlock.set(container.id, chipIndex + 1);
        const containerPos = positions.get(container.id);
        const containerTop = containerPos?.topPx ?? naturalTop;
        positions.set(e.id, {
          topPx: containerTop + BLOCK_HEADER_PX + chipIndex * CHIP_STEP_PX,
          heightPx: CHIP_STEP_PX,
          embeddedIn: container.id,
        });
      } else {
        positions.set(e.id, { topPx: naturalTop, heightPx: CHIP_STEP_PX });
      }
    }

    const baseEnd = (maxMin + VIEWPORT_PADDING_MIN - origin) * PX_PER_MIN;

    return {
      sorted: sortedEvents,
      originMinutes: origin,
      heightPx: baseEnd,
      positionById: positions,
    };
  }, [events]);

  // One-shot scroll to the event in progress (or the now-line) the first
  // time we have the data needed to compute it. Subsequent re-renders are
  // gated by hasScrolledRef so the page doesn't keep snapping.
  useEffect(() => {
    if (hasScrolledRef.current) return;
    if (!scrollToNowOnMount || nowMinutes === undefined || sorted.length === 0) return;
    const root = rootRef.current;
    if (!root) return;

    const inProgress = sorted.find((e) => {
      const start = parseTime(e.startTime);
      const end = e.endTime ? parseTime(e.endTime) : start;
      return start <= nowMinutes && nowMinutes < end;
    });

    const targetTopWithinList = inProgress
      ? (positionById.get(inProgress.id)?.topPx ?? 0)
      : (nowMinutes - originMinutes) * PX_PER_MIN;

    const rootTopOnPage = root.getBoundingClientRect().top + window.scrollY;
    const scrollTo = Math.max(0, rootTopOnPage + targetTopWithinList - SCROLL_TOP_PADDING_PX);
    window.scrollTo({ top: scrollTo, behavior: "auto" });
    hasScrolledRef.current = true;
  }, [scrollToNowOnMount, nowMinutes, sorted, originMinutes, positionById]);

  if (events.length === 0) {
    return (
      <div className={styles.empty} role="status">
        Nothing scheduled yet.
      </div>
    );
  }

  // Render blocks first, then markers, so embedded chips paint on top of
  // their containing block (browsers paint later siblings above earlier ones
  // when z-indexes are equal; markerCompact also has z-index: 2 as a belt).
  const blocks = sorted.filter(isDurationEvent);
  const markers = sorted.filter((e) => !isDurationEvent(e));

  return (
    <div ref={rootRef} className={styles.list} style={{ height: `${heightPx}px` }}>
      {blocks.map((event) => {
        const pos = positionById.get(event.id);
        const tap = onEventTap ? () => onEventTap(event) : undefined;
        return (
          <DurationBlock
            key={event.id}
            event={event}
            topPx={pos?.topPx ?? 0}
            heightPx={pos?.heightPx ?? MIN_BLOCK_HEIGHT}
            {...(tap ? { onClick: tap } : {})}
          />
        );
      })}

      {markers.map((event) => {
        const pos = positionById.get(event.id);
        const tap = onEventTap ? () => onEventTap(event) : undefined;
        return (
          <PointMarker
            key={event.id}
            event={event}
            topPx={pos?.topPx ?? 0}
            compact={!!pos?.embeddedIn}
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
