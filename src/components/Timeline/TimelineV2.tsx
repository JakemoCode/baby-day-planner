"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Event } from "@/domain";
import { parseTime, TIMELINE_DEFAULTS } from "@/domain";
import { Block } from "./Block";
import { InstantCluster } from "./InstantCluster";
import { NowBar } from "./NowBar";
import { groupInstants } from "./groupInstants";
import styles from "./TimelineV2.module.css";

export type TimelineV2Props = {
  events: Event[];
  /** Minutes-since-midnight; omit on non-today screens. */
  nowMinutes?: number;
  /** Tap handler for both blocks and instant chips. */
  onEventTap?: (event: Event) => void;
  /** One-shot scroll on mount to bring "now" into view. */
  scrollToNowOnMount?: boolean;
  /** Settings-driven; falls back to TIMELINE_DEFAULTS.pxPerHour. */
  pxPerHour?: number;
  /** Past events render at 0.45 opacity. Only meaningful with nowMinutes. */
  dimPast?: boolean;
  /** Block fill encoding. Default 'type'. */
  colorMode?: "type" | "owner";
};

// Layout constants. Axis tightened to fit the short "10p" / "1:05p" form;
// gutter widened so chips like "Bottle 1 1:05p" fit on one row without
// overflowing the right edge.
const AXIS_W = 36;
const GUTTER_W = 124;
const BLOCK_LEFT_INSET = AXIS_W + 4;
const BLOCK_RIGHT_INSET = GUTTER_W;
const PUTDOWN_RIGHT_EXTRA = 30; // putdown stops short of the right edge
const CUSTOM_LEFT_EXTRA = 110; // custom block anchored right as a sub-block
const LEADER_LINE_W = 8;
const VIEWPORT_PADDING_MIN = 30;
const DEFAULT_VIEWPORT = { start: 7 * 60, end: 21 * 60 };
const SCROLL_TOP_PADDING_PX = 80;

function formatHourLabel(hour24: number): string {
  // Compact "10A" / "1P" form to match the design spec; full "AM/PM" doesn't
  // fit comfortably in the tightened 36px axis lane.
  const h = ((hour24 % 24) + 24) % 24;
  const period = h < 12 ? "A" : "P";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

/**
 * Compute left/right insets for a duration block based on its variant.
 *   - putdown:  anchored LEFT; right inset increased so wake's text shows
 *   - extra:    anchored RIGHT (sub-block); left inset increased so the
 *               parent wake/nap label stays visible
 *   - else:     full center lane (between AXIS_W and GUTTER_W)
 */
function blockGeometry(event: Event): { leftPx: number; rightPx: number } {
  if (event.type === "putdown") {
    return { leftPx: BLOCK_LEFT_INSET, rightPx: BLOCK_RIGHT_INSET + PUTDOWN_RIGHT_EXTRA };
  }
  if (event.type === "extra") {
    return { leftPx: BLOCK_LEFT_INSET + CUSTOM_LEFT_EXTRA, rightPx: BLOCK_RIGHT_INSET };
  }
  return { leftPx: BLOCK_LEFT_INSET, rightPx: BLOCK_RIGHT_INSET };
}

export function TimelineV2({
  events,
  nowMinutes,
  onEventTap,
  scrollToNowOnMount = false,
  pxPerHour = TIMELINE_DEFAULTS.pxPerHour,
  dimPast = false,
  colorMode = TIMELINE_DEFAULTS.colorMode,
}: TimelineV2Props) {
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

    // Wake events that coincide with the start of WW1 are redundant (§11.A).
    const allBlocks = events.filter((e) => e.kind === "block");
    const filtered = events.filter((e) => {
      if (e.type !== "wake") return true;
      return !allBlocks.some((b) => b.startTime === e.startTime);
    });

    const starts = filtered.map((e) => parseTime(e.startTime));
    const ends = filtered.map((e) => (e.endTime ? parseTime(e.endTime) : parseTime(e.startTime)));
    const minMin = Math.min(...starts, DEFAULT_VIEWPORT.start);
    const maxMin = Math.max(...ends, DEFAULT_VIEWPORT.end);
    const origin = Math.max(0, minMin - VIEWPORT_PADDING_MIN);
    const height = (maxMin + VIEWPORT_PADDING_MIN - origin) * pxPerMin;

    return {
      blocks: filtered.filter((e) => e.kind === "block"),
      groups: groupInstants(filtered),
      originMinutes: origin,
      heightPx: height,
    };
  }, [events, pxPerMin]);

  // One-shot scroll to "now" once we have data.
  useEffect(() => {
    if (hasScrolledRef.current) return;
    if (!scrollToNowOnMount || nowMinutes === undefined || events.length === 0) return;
    const root = rootRef.current;
    if (!root) return;
    const targetTopWithinList = (nowMinutes - originMinutes) * pxPerMin;
    const rootTopOnPage = root.getBoundingClientRect().top + window.scrollY;
    const scrollTo = Math.max(0, rootTopOnPage + targetTopWithinList - SCROLL_TOP_PADDING_PX);
    window.scrollTo({ top: scrollTo, behavior: "auto" });
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

  const yOf = (mins: number) => (mins - originMinutes) * pxPerMin;
  const isPast = (mins: number) => dimPast && nowMinutes !== undefined && mins < nowMinutes;

  // Hour ticks: every whole hour visible.
  const endMinutes = originMinutes + heightPx / pxPerMin;
  const firstHour = Math.ceil(originMinutes / 60);
  const lastHour = Math.floor(endMinutes / 60);
  const hourTicks: { hour: number; topPx: number }[] = [];
  for (let h = firstHour; h <= lastHour; h++) {
    hourTicks.push({ hour: h, topPx: (h * 60 - originMinutes) * pxPerMin });
  }

  return (
    <div ref={rootRef} className={styles.outer}>
      <div className={styles.inner} style={{ height: `${heightPx}px` }}>
        {/* Hour grid */}
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

        {/* Blocks (z-order via render order: wake/nap < putdown < custom) */}
        {blocks
          .slice()
          .sort((a, b) => zOrder(a) - zOrder(b))
          .map((event) => {
            const { leftPx, rightPx } = blockGeometry(event);
            const top = yOf(parseTime(event.startTime));
            const end = event.endTime ? parseTime(event.endTime) : parseTime(event.startTime);
            // Minimum tappable height for very short blocks. A 1-minute
            // nap (e.g. accidental Start/End in quick succession) would
            // render at 2px and be invisible/untappable; clamp to 24px so
            // the user can always tap to edit / fix it.
            const naturalH = (end - parseTime(event.startTime)) * pxPerMin;
            const heightPxBlock = Math.max(24, naturalH);
            const tap = onEventTap ? () => onEventTap(event) : undefined;
            return (
              <Block
                key={event.id}
                event={event}
                topPx={top}
                heightPx={heightPxBlock}
                leftPx={leftPx}
                rightPx={rightPx}
                colorMode={colorMode}
                past={isPast(end)}
                {...(tap ? { onClick: tap } : {})}
              />
            );
          })}

        {/* Instant clusters in the right gutter */}
        {groups.map((g) => (
          <InstantCluster
            key={g.key}
            items={g.items}
            topPx={yOf(g.startMinutes) - 10}
            rightPx={4}
            widthPx={GUTTER_W - 8}
            leaderWidthPx={LEADER_LINE_W}
            colorMode={colorMode}
            past={isPast(g.startMinutes)}
            {...(onEventTap ? { onEventTap } : {})}
          />
        ))}

        {/* Now bar */}
        {nowMinutes !== undefined && (
          <NowBar topPx={yOf(nowMinutes)} axisWidthPx={AXIS_W} nowMinutes={nowMinutes} />
        )}
      </div>
    </div>
  );
}

/**
 * Z-order via render order (later siblings paint over earlier).
 * Wake/nap < putdown < custom. (Handoff §Z-Order.)
 */
function zOrder(e: Event): number {
  if (e.type === "putdown") return 2;
  if (e.type === "extra") return 3;
  return 1;
}
