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
const BLOCK_HEADER_PX = 56;
/** Vertical step between stacked chips inside a block. */
const CHIP_STEP_PX = 28;
/** Breathing room below a duration block before a free-standing event below it. */
const BLOCK_BOTTOM_GAP_PX = 8;
/** Minimum gap between two consecutive free-standing point markers so they
 *  don't visually overlap when they fall close together in time. */
const FREE_MARKER_GAP_PX = 4;
/** Padding above the current time when auto-scrolling so context is visible. */
const SCROLL_TOP_PADDING_PX = 80;
const DEFAULT_VIEWPORT = { start: 7 * 60, end: 21 * 60 };

type BlockEvent = Event & { endTime: string };
const isDurationEvent = (e: Event): e is BlockEvent =>
  (e.type === "nap" || e.type === "wake_window" || e.type === "extra" || e.type === "putdown") &&
  e.endTime !== undefined;

type Position = { topPx: number; heightPx: number; embeddedIn?: string };

function formatHourLabel(hour24: number): string {
  const h = ((hour24 % 24) + 24) % 24;
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

export function TimelineList({
  events,
  nowMinutes,
  onEventTap,
  scrollToNowOnMount = false,
}: TimelineListProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const { sorted, originMinutes, heightPx, positionById, compoundRows } = useMemo(() => {
    if (events.length === 0) {
      return {
        sorted: [] as Event[],
        originMinutes: 0,
        heightPx: 0,
        positionById: new Map<string, Position>(),
        compoundRows: [] as { hour: number; events: Event[]; topPx: number }[],
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

    // Group free-standing markers that fall *exactly on the hour* — when
    // there are 2 or 3 such siblings the hour tick already announces the
    // time, so the page stays calm by collapsing them into a single row.
    // 4+ at the same hour falls back to individual rendering (a small list
    // of chips reads more like a real burst than a calm cluster).
    const onHourFreeGroups = new Map<number, Event[]>();
    for (const e of sortedEvents) {
      if (isDurationEvent(e)) continue;
      const startMin = parseTime(e.startTime);
      if (startMin % 60 !== 0) continue;
      const insideBlock = blocks.some((b) => {
        const bs = parseTime(b.startTime);
        const be = parseTime(b.endTime);
        return bs <= startMin && startMin < be;
      });
      if (insideBlock) continue;
      const hour = startMin / 60;
      const list = onHourFreeGroups.get(hour) ?? [];
      list.push(e);
      onHourFreeGroups.set(hour, list);
    }
    const groupedIds = new Set<string>();
    for (const [, evts] of onHourFreeGroups) {
      if (evts.length >= 2 && evts.length <= 3) {
        evts.forEach((e) => groupedIds.add(e.id));
      }
    }

    const positions = new Map<string, Position>();
    const chipCountByBlock = new Map<string, number>();
    const chipFrontierByBlock = new Map<string, number>();
    let lastFreeMarkerBottom = -Infinity;

    for (const e of sortedEvents) {
      if (groupedIds.has(e.id)) continue; // rendered as part of a compound row
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
        // Time-anchored chip: place at its actual time position, but with two
        // floors to keep the layout readable —
        //   1. Below the block's header (label + range row).
        //   2. Below the previous chip in this block (so dense clusters stack).
        const containerPos = positions.get(container.id);
        const containerTop = containerPos?.topPx ?? naturalTop;
        const headerFloor = containerTop + BLOCK_HEADER_PX;
        const prevChipBottom = chipFrontierByBlock.get(container.id) ?? -Infinity;
        const topPx = Math.max(naturalTop, headerFloor, prevChipBottom);
        chipFrontierByBlock.set(container.id, topPx + CHIP_STEP_PX);
        chipCountByBlock.set(container.id, (chipCountByBlock.get(container.id) ?? 0) + 1);
        positions.set(e.id, {
          topPx,
          heightPx: CHIP_STEP_PX,
          embeddedIn: container.id,
        });
      } else {
        // Free-standing markers respect two spacing rules so adjacent labels
        // don't visually collide:
        //   1. Sit at least BLOCK_BOTTOM_GAP_PX below any preceding block's bottom.
        //   2. Sit at least FREE_MARKER_GAP_PX below the previous free-standing marker.
        let topPx = naturalTop;
        for (const b of blocks) {
          const bPos = positions.get(b.id);
          if (!bPos) continue;
          const blockBottom = bPos.topPx + bPos.heightPx;
          if (naturalTop >= bPos.topPx && naturalTop < blockBottom + BLOCK_BOTTOM_GAP_PX) {
            topPx = Math.max(topPx, blockBottom + BLOCK_BOTTOM_GAP_PX);
          }
        }
        if (topPx - lastFreeMarkerBottom < FREE_MARKER_GAP_PX) {
          topPx = lastFreeMarkerBottom + FREE_MARKER_GAP_PX;
        }
        positions.set(e.id, { topPx, heightPx: CHIP_STEP_PX });
        lastFreeMarkerBottom = topPx + CHIP_STEP_PX;
      }
    }

    const compoundRows: { hour: number; events: Event[]; topPx: number }[] = [];
    for (const [hour, evts] of onHourFreeGroups) {
      if (evts.length >= 2 && evts.length <= 3) {
        compoundRows.push({
          hour,
          events: evts,
          // Sit just below the hour tick line so the row obviously belongs
          // to the hour rather than floating between two ticks.
          topPx: (hour * 60 - origin) * PX_PER_MIN + 4,
        });
      }
    }

    const baseEnd = (maxMin + VIEWPORT_PADDING_MIN - origin) * PX_PER_MIN;
    const maxBottom = Math.max(
      baseEnd,
      ...Array.from(positions.values()).map((p) => p.topPx + p.heightPx),
      ...compoundRows.map((r) => r.topPx + CHIP_STEP_PX),
    );

    return {
      sorted: sortedEvents,
      originMinutes: origin,
      heightPx: maxBottom,
      positionById: positions,
      compoundRows,
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
  const groupedIdSet = new Set(compoundRows.flatMap((r) => r.events.map((e) => e.id)));
  const markers = sorted.filter((e) => !isDurationEvent(e) && !groupedIdSet.has(e.id));

  // Hour ticks: from the first whole hour at/after origin, up through the
  // last whole hour visible. Each gets a hairline + a left-gutter label.
  const endMinutes = originMinutes + heightPx / PX_PER_MIN;
  const firstHour = Math.ceil(originMinutes / 60);
  const lastHour = Math.floor(endMinutes / 60);
  const hourTicks: { hour: number; topPx: number; label: string }[] = [];
  for (let h = firstHour; h <= lastHour; h++) {
    const hourLabel = formatHourLabel(h);
    hourTicks.push({
      hour: h,
      topPx: (h * 60 - originMinutes) * PX_PER_MIN,
      label: hourLabel,
    });
  }

  return (
    <div ref={rootRef} className={styles.list} style={{ height: `${heightPx}px` }}>
      {hourTicks.map((tick) => (
        <span
          key={`tick-${tick.hour}`}
          className={styles.hourTick}
          style={{ top: `${tick.topPx}px` }}
          aria-hidden="true"
        />
      ))}
      {hourTicks.map((tick) => (
        <span
          key={`label-${tick.hour}`}
          className={styles.hourLabel}
          style={{ top: `${tick.topPx}px` }}
        >
          {tick.label}
        </span>
      ))}

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

      {compoundRows.map((row) => (
        <div
          key={`hour-row-${row.hour}`}
          className={styles.compoundRow}
          style={{ top: `${row.topPx}px` }}
          data-testid="compound-hour-row"
        >
          <span className={styles.compoundDot} aria-hidden="true" />
          <span className={styles.compoundLabels}>
            {row.events.map((e) => e.label).join(" · ")}
          </span>
        </div>
      ))}

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
