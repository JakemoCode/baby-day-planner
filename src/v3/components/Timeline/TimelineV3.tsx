"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Event, OwnersConfig, TimeMin } from "../../schemas";
import { Block } from "./Block";
import { InstantCluster } from "./InstantCluster";
import { CollapsedInstantCluster } from "./CollapsedInstantCluster";
import { GroupedEventsSheet } from "./GroupedEventsSheet";
import { NowBar } from "./NowBar";
import { PUTDOWN_KIND_TAG } from "./expandPutdown";
import { groupInstants, mergeNearbyGroups, type InstantGroup } from "./groupInstants";
import styles from "./TimelineV2.module.css";

export type TimelineV3Props = {
  /**
   * Events ready for render. Callers must apply `renderProjection`
   * (dream-feed label + putdown expansion) before passing in projected
   * events. Archived/recorded events pass through unchanged.
   */
  events: Event[];
  owners: OwnersConfig;
  /** Optional: render the now-bar. Omit on non-today screens. */
  nowMinutes?: TimeMin;
  onEventTap?: (event: Event) => void;
  scrollToNowOnMount?: boolean;
  pxPerHour?: number;
  /** Past events render at 0.45 opacity. Only meaningful with nowMinutes. */
  dimPast?: boolean;
  colorMode?: "type" | "owner";
  /**
   * Minutes of empty space added before the earliest event and after the
   * latest. Defaults to 30. Pages that always start at a known boundary
   * (e.g. Tomorrow preview always begins at the planned wake time) can
   * pass 0 to drop the gap.
   */
  viewportPaddingMin?: number;
  /**
   * When true, the viewport spans only the actual events plus padding —
   * no default 5A-9P floor/ceiling. Used by preview surfaces (Tomorrow,
   * History detail) where there's no reason to scroll past empty hours.
   * Defaults to false so the canonical /timeline still shows the full
   * day even when most of it is empty.
   */
  clampToEvents?: boolean;
};

const AXIS_W = 28;
const GUTTER_W = 124;
const BLOCK_LEFT_INSET = AXIS_W + 8;
const BLOCK_RIGHT_INSET = GUTTER_W + 24;
// Putdown stops before the chip column; owner name not rendered (stripe inherits from parent nap).
const PUTDOWN_RIGHT_INSET = BLOCK_RIGHT_INSET + 26;
const CUSTOM_LEFT_EXTRA = 110;
// Right offset of the instant chip column.
const INSTANT_COLUMN_RIGHT = 4;
// §F53: extra-duration band width (must match EXTRA_BAND_WIDTH_PX in Block.tsx).
// Its right offset is set so the band's LEFT edge lands on the column break
// (BLOCK_RIGHT_INSET, where cascade blocks end).
const EXTRA_BAND_WIDTH_PX = 80;
// Leader bridges the chip cluster's left edge (INSTANT_COLUMN_RIGHT + 140 chip
// width = 144 from right) to the block-lane edge / column break (BLOCK_RIGHT_INSET
// = 148) — exactly 4px. Was 8px, overshooting 4px past the break (invisible until
// the §F53 extra band drew an edge there; the tail bled into the duration column).
const LEADER_LINE_W = 4;
const VIEWPORT_PADDING_MIN = 30;
const DEFAULT_VIEWPORT = { start: 5 * 60, end: 21 * 60 };
const DEFAULT_VIEWPORT_END_CAP = 24 * 60; // midnight
const SCROLL_TOP_PADDING_PX = 80;
const DEFAULT_PX_PER_HOUR = 120;
// Collision threshold: 38 px ≈ wrapped chip height + 4 px gap. Update if chip CSS changes.
const COLLAPSE_CHIP_HEIGHT_PX = 38;
const COLLAPSE_VERTICAL_GAP_PX = 4;

function findScrollParent(el: HTMLElement): HTMLElement | Window {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`)) return node;
    node = node.parentElement;
  }
  return window;
}

function formatHourLabel(hour24: number): string {
  const h = ((hour24 % 24) + 24) % 24;
  const period = h < 12 ? "A" : "P";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

function blockGeometry(event: Event): { leftPx: number; rightPx: number } {
  if (event.eventKey === PUTDOWN_KIND_TAG) {
    return { leftPx: BLOCK_LEFT_INSET, rightPx: PUTDOWN_RIGHT_INSET };
  }
  // §F53: extra-with-duration flips to the right INSTANT column as a
  // fixed-width band, right-aligned under the chips (Block sizes the width).
  // It layers with chips by time via CSS z-index: future chips on top, past
  // chips behind. Pump + recurring stay in the left custom column, coexisting
  // with naps/bedtime.
  if (event.type === "extra") {
    return { leftPx: BLOCK_LEFT_INSET, rightPx: BLOCK_RIGHT_INSET - EXTRA_BAND_WIDTH_PX };
  }
  if (event.type === "pump" || event.type === "daily_recurring") {
    return { leftPx: BLOCK_LEFT_INSET + CUSTOM_LEFT_EXTRA, rightPx: BLOCK_RIGHT_INSET };
  }
  return { leftPx: BLOCK_LEFT_INSET, rightPx: BLOCK_RIGHT_INSET };
}

/**
 * DOM paint order — the tiebreaker when two blocks share a CSS z-index
 * (Block.module.css). recurring shares the sleep tier (z:2) with naps, so it
 * must sort AFTER naps here to win the tie and paint on top of them (§F53).
 */
function zOrder(e: Event): number {
  if (e.type === "extra" || e.type === "daily_recurring") return 4;
  if (e.eventKey === PUTDOWN_KIND_TAG) return 3;
  if (e.type === "nap" || e.type === "bedtime") return 2;
  return 1;
}

export function TimelineV3({
  events,
  owners,
  nowMinutes,
  onEventTap,
  scrollToNowOnMount = false,
  pxPerHour = DEFAULT_PX_PER_HOUR,
  dimPast = false,
  colorMode = "type",
  viewportPaddingMin = VIEWPORT_PADDING_MIN,
  clampToEvents = false,
}: TimelineV3Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const pxPerMin = pxPerHour / 60;

  const { blocks, groups, originMinutes, heightPx } = useMemo(() => {
    if (events.length === 0) {
      return {
        blocks: [] as Event[],
        groups: [] as ReturnType<typeof groupInstants>,
        originMinutes: 0,
        heightPx: 0,
      };
    }

    const starts = events.map((e) => e.startTime);
    const ends = events.map((e) => e.endTime ?? e.startTime);
    // clampToEvents uses the events' range; default keeps 5A–9P floor/ceiling. Both cap at midnight.
    const minMin = clampToEvents
      ? Math.min(...starts)
      : Math.min(...starts, DEFAULT_VIEWPORT.start);
    const maxRaw = clampToEvents ? Math.max(...ends) : Math.max(...ends, DEFAULT_VIEWPORT.end);
    const maxMin = Math.min(maxRaw, DEFAULT_VIEWPORT_END_CAP);
    const origin = Math.max(0, minMin - viewportPaddingMin);
    const height = (maxMin + viewportPaddingMin - origin) * pxPerMin;

    const rawGroups = groupInstants(events);
    const collisionMinutes = (COLLAPSE_CHIP_HEIGHT_PX + COLLAPSE_VERTICAL_GAP_PX) / pxPerMin;
    const mergedGroups = mergeNearbyGroups(rawGroups, collisionMinutes);
    return {
      blocks: events.filter((e) => e.kind === "block"),
      groups: mergedGroups,
      originMinutes: origin,
      heightPx: height,
    };
  }, [events, pxPerMin, viewportPaddingMin, clampToEvents]);

  // Populated when user taps a collapsed cluster.
  const [groupedSheet, setGroupedSheet] = useState<InstantGroup | null>(null);

  useEffect(() => {
    if (hasScrolledRef.current) return;
    if (!scrollToNowOnMount || nowMinutes === undefined || events.length === 0) return;
    const root = rootRef.current;
    if (!root) return;
    // AppShell's <main> is the scroll container; walk up to find it, fall back to window.
    const scrollParent = findScrollParent(root);
    const targetTopWithinList = (nowMinutes - originMinutes) * pxPerMin;
    if (scrollParent instanceof HTMLElement) {
      const rootTopInParent =
        root.getBoundingClientRect().top -
        scrollParent.getBoundingClientRect().top +
        scrollParent.scrollTop;
      const scrollTo = Math.max(0, rootTopInParent + targetTopWithinList - SCROLL_TOP_PADDING_PX);
      scrollParent.scrollTo({ top: scrollTo, behavior: "auto" });
    } else {
      const rootTopOnPage = root.getBoundingClientRect().top + window.scrollY;
      const scrollTo = Math.max(0, rootTopOnPage + targetTopWithinList - SCROLL_TOP_PADDING_PX);
      window.scrollTo({ top: scrollTo, behavior: "auto" });
    }
    hasScrolledRef.current = true;
  }, [scrollToNowOnMount, nowMinutes, events.length, originMinutes, pxPerMin]);

  if (events.length === 0) {
    return (
      <div className={styles.outer}>
        <div className={styles.empty} role="status">
          Nothing scheduled yet.
        </div>
      </div>
    );
  }

  const yOf = (mins: TimeMin) => (mins - originMinutes) * pxPerMin;
  const isPast = (mins: TimeMin) => dimPast && nowMinutes !== undefined && mins < nowMinutes;

  const endMinutes = originMinutes + heightPx / pxPerMin;
  const firstHour = Math.ceil(originMinutes / 60);
  const lastHour = Math.floor(endMinutes / 60);
  const hourTicks: { hour: number; topPx: number }[] = [];
  for (let h = firstHour; h <= lastHour; h++) {
    hourTicks.push({ hour: h, topPx: (h * 60 - originMinutes) * pxPerMin });
  }

  return (
    <div ref={rootRef} className={styles.outer}>
      <div
        data-testid="timeline-inner"
        className={styles.inner}
        style={{ height: `${heightPx}px` }}
      >
        {hourTicks.map((t) => (
          <span
            key={`tick-${t.hour}`}
            className={styles.hourTick}
            style={{ left: `${AXIS_W}px`, right: 0, top: `${t.topPx}px` }}
            aria-hidden="true"
          />
        ))}
        {hourTicks.map((t) => (
          <span
            key={`label-${t.hour}`}
            className={styles.hourLabel}
            style={{ width: `${AXIS_W}px`, top: `${t.topPx - 7}px` }}
          >
            {formatHourLabel(t.hour)}
          </span>
        ))}

        {blocks
          .slice()
          .sort((a, b) => zOrder(a) - zOrder(b))
          .map((event) => {
            const { leftPx, rightPx } = blockGeometry(event);
            const top = yOf(event.startTime);
            const end = event.endTime ?? event.startTime;
            // Putdowns are not tappable; parent event is what gets edited.
            const isPutdown = event.eventKey === PUTDOWN_KIND_TAG;
            // Tappable blocks: 24px thumb floor. Putdown: 20px legibility floor (single-row label).
            // Clamp bottom edge to viewport — overnight blocks otherwise bleed past midnight axis.
            const clampedEnd = Math.min(end, endMinutes);
            const naturalH = (clampedEnd - event.startTime) * pxPerMin;
            const minH = isPutdown ? 20 : 24;
            const heightPxBlock = Math.max(minH, naturalH);
            const tap = onEventTap && !isPutdown ? () => onEventTap(event) : undefined;
            return (
              <Block
                key={event.id}
                event={event}
                topPx={top}
                heightPx={heightPxBlock}
                leftPx={leftPx}
                rightPx={rightPx}
                owners={owners}
                colorMode={colorMode}
                past={isPast(end)}
                {...(tap ? { onClick: tap } : {})}
              />
            );
          })}

        {groups.map((g) => {
          const topPx = yOf(g.startMinutes);
          const past = isPast(g.startMinutes);
          // 2+ events collapse to a single chip; tap opens listing sheet.
          if (g.items.length >= 2) {
            return (
              <CollapsedInstantCluster
                key={g.key}
                items={g.items}
                startMinutes={g.startMinutes}
                endMinutes={g.endMinutes}
                topPx={topPx}
                rightPx={INSTANT_COLUMN_RIGHT}
                widthPx={140}
                leaderWidthPx={LEADER_LINE_W}
                past={past}
                onTap={() => setGroupedSheet(g)}
              />
            );
          }
          return (
            <InstantCluster
              key={g.key}
              items={g.items}
              topPx={topPx} /* self-centers via translateY(-50%) */
              rightPx={INSTANT_COLUMN_RIGHT}
              widthPx={140}
              leaderWidthPx={LEADER_LINE_W}
              owners={owners}
              colorMode={colorMode}
              past={past}
              {...(onEventTap ? { onEventTap } : {})}
            />
          );
        })}

        {nowMinutes !== undefined && (
          <NowBar topPx={yOf(nowMinutes)} axisWidthPx={AXIS_W} nowMinutes={nowMinutes} />
        )}
      </div>
      <GroupedEventsSheet
        open={groupedSheet !== null}
        items={groupedSheet?.items ?? []}
        startMinutes={groupedSheet?.startMinutes ?? 0}
        endMinutes={groupedSheet?.endMinutes ?? 0}
        owners={owners}
        onCancel={() => setGroupedSheet(null)}
        onTapEvent={(event) => {
          setGroupedSheet(null);
          onEventTap?.(event);
        }}
      />
    </div>
  );
}
