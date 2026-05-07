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
   * When true, on first mount the page is scrolled so the current-time
   * indicator (or the event currently in progress) is in view. Defaults
   * to false so existing usages don't change behavior.
   */
  scrollToNowOnMount?: boolean;
};

const PX_PER_MIN = 2;
const VIEWPORT_PADDING_MIN = 30;
const MIN_BLOCK_HEIGHT = 32;
/** Approximate rendered height of a PointMarker, used for frontier tracking. */
const POINT_MARKER_HEIGHT = 32;
/** Minimum gap between a stacked event and the previous one. */
const STACK_GAP_PX = 4;
/** Padding above the current time when auto-scrolling so context is visible. */
const SCROLL_TOP_PADDING_PX = 80;
const DEFAULT_VIEWPORT = { start: 7 * 60, end: 21 * 60 };

type BlockEvent = Event & { endTime: string };
const isDurationEvent = (e: Event): e is BlockEvent =>
  (e.type === "nap" || e.type === "wake_window" || e.type === "extra") && e.endTime !== undefined;

type Position = { topPx: number; heightPx: number };

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

    const sortedEvents = [...events].sort(
      (a, b) => parseTime(a.startTime) - parseTime(b.startTime),
    );

    const startTimes = sortedEvents.map((e) => parseTime(e.startTime));
    const endTimes = sortedEvents.map((e) =>
      e.endTime ? parseTime(e.endTime) : parseTime(e.startTime),
    );
    const minMin = Math.min(...startTimes, DEFAULT_VIEWPORT.start);
    const maxMin = Math.max(...endTimes, DEFAULT_VIEWPORT.end);
    const origin = Math.max(0, minMin - VIEWPORT_PADDING_MIN);

    // Forward-walking "frontier": each event is placed at max(naturalTop,
    // frontier + gap) so events that follow a stacked cluster are pushed
    // past the cluster rather than rendering inside it. Initial frontier
    // is -GAP so a single event at the viewport origin keeps its natural
    // (un-bumped) position.
    const positions = new Map<string, Position>();
    let frontier = -STACK_GAP_PX;
    for (const e of sortedEvents) {
      const startMin = parseTime(e.startTime);
      const naturalTop = (startMin - origin) * PX_PER_MIN;
      const topPx = Math.max(naturalTop, frontier + STACK_GAP_PX);
      const blockHeight = e.endTime
        ? Math.max(MIN_BLOCK_HEIGHT, (parseTime(e.endTime) - startMin) * PX_PER_MIN)
        : POINT_MARKER_HEIGHT;
      positions.set(e.id, { topPx, heightPx: blockHeight });
      frontier = topPx + blockHeight;
    }

    const baseEnd = (maxMin + VIEWPORT_PADDING_MIN - origin) * PX_PER_MIN;
    const totalHeight = Math.max(baseEnd, frontier + STACK_GAP_PX);

    return {
      sorted: sortedEvents,
      originMinutes: origin,
      heightPx: totalHeight,
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

  return (
    <div ref={rootRef} className={styles.list} style={{ height: `${heightPx}px` }}>
      {sorted.map((event) => {
        const pos = positionById.get(event.id);
        const topPx = pos?.topPx ?? 0;
        const tap = onEventTap ? () => onEventTap(event) : undefined;

        if (isDurationEvent(event)) {
          const blockHeight = pos?.heightPx ?? MIN_BLOCK_HEIGHT;
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
