"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Event, OwnersConfig, TimeMin } from "../../schemas";
import { Block } from "./Block";
import { InstantCluster } from "./InstantCluster";
import { NowBar } from "./NowBar";
import { PUTDOWN_KIND_TAG, expandPutdownBlocks } from "./expandPutdown";
import { groupInstants } from "./groupInstants";
import styles from "./TimelineV2.module.css";

export type TimelineV3Props = {
  events: Event[];
  owners: OwnersConfig;
  putdownLeadMinutes: TimeMin;
  /** Optional: render the now-bar. Omit on non-today screens. */
  nowMinutes?: TimeMin;
  onEventTap?: (event: Event) => void;
  scrollToNowOnMount?: boolean;
  pxPerHour?: number;
  /** Past events render at 0.45 opacity. Only meaningful with nowMinutes. */
  dimPast?: boolean;
  colorMode?: "type" | "owner";
};

const AXIS_W = 36;
const GUTTER_W = 124;
const BLOCK_LEFT_INSET = AXIS_W + 4;
const BLOCK_RIGHT_INSET = GUTTER_W;
const PUTDOWN_RIGHT_EXTRA = 30;
const CUSTOM_LEFT_EXTRA = 110;
const LEADER_LINE_W = 8;
const VIEWPORT_PADDING_MIN = 30;
const DEFAULT_VIEWPORT = { start: 7 * 60, end: 21 * 60 };
const SCROLL_TOP_PADDING_PX = 80;
const DEFAULT_PX_PER_HOUR = 80;

function formatHourLabel(hour24: number): string {
  const h = ((hour24 % 24) + 24) % 24;
  const period = h < 12 ? "A" : "P";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

function blockGeometry(event: Event): { leftPx: number; rightPx: number } {
  if (event.eventKey === PUTDOWN_KIND_TAG) {
    return { leftPx: BLOCK_LEFT_INSET, rightPx: BLOCK_RIGHT_INSET + PUTDOWN_RIGHT_EXTRA };
  }
  if (event.type === "extra") {
    return { leftPx: BLOCK_LEFT_INSET + CUSTOM_LEFT_EXTRA, rightPx: BLOCK_RIGHT_INSET };
  }
  return { leftPx: BLOCK_LEFT_INSET, rightPx: BLOCK_RIGHT_INSET };
}

/**
 * Z-order via render order (later siblings paint over earlier).
 * wake_window < nap/bedtime < putdown < extra. Naps win against
 * wake_windows so a tiny / 0-minute nap (clamped to a 24px min-height)
 * still shows above an adjacent wake_window starting at the same y.
 */
function zOrder(e: Event): number {
  if (e.type === "extra") return 4;
  if (e.eventKey === PUTDOWN_KIND_TAG) return 3;
  if (e.type === "nap" || e.type === "bedtime") return 2;
  return 1;
}

export function TimelineV3({
  events,
  owners,
  putdownLeadMinutes,
  nowMinutes,
  onEventTap,
  scrollToNowOnMount = false,
  pxPerHour = DEFAULT_PX_PER_HOUR,
  dimPast = false,
  colorMode = "type",
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

    const expanded = expandPutdownBlocks(events, putdownLeadMinutes);

    const starts = expanded.map((e) => e.startTime);
    const ends = expanded.map((e) => e.endTime ?? e.startTime);
    const minMin = Math.min(...starts, DEFAULT_VIEWPORT.start);
    const maxMin = Math.max(...ends, DEFAULT_VIEWPORT.end);
    const origin = Math.max(0, minMin - VIEWPORT_PADDING_MIN);
    const height = (maxMin + VIEWPORT_PADDING_MIN - origin) * pxPerMin;

    return {
      blocks: expanded.filter((e) => e.kind === "block"),
      groups: groupInstants(expanded),
      originMinutes: origin,
      heightPx: height,
    };
  }, [events, pxPerMin, putdownLeadMinutes]);

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
      <div className={styles.inner} style={{ height: `${heightPx}px` }}>
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
            // Min tappable height (24px) for very short blocks so user can
            // always tap to edit even a 1-minute accidental nap.
            const naturalH = (end - event.startTime) * pxPerMin;
            const heightPxBlock = Math.max(24, naturalH);
            // Putdown synthetics are not user-tappable in V3 — the
            // parent event is what gets edited. Tap the parent instead.
            const isPutdown = event.eventKey === PUTDOWN_KIND_TAG;
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

        {groups.map((g) => (
          <InstantCluster
            key={g.key}
            items={g.items}
            topPx={yOf(g.startMinutes) - 10}
            rightPx={4}
            widthPx={GUTTER_W - 8}
            leaderWidthPx={LEADER_LINE_W}
            owners={owners}
            colorMode={colorMode}
            past={isPast(g.startMinutes)}
            {...(onEventTap ? { onEventTap } : {})}
          />
        ))}

        {nowMinutes !== undefined && (
          <NowBar topPx={yOf(nowMinutes)} axisWidthPx={AXIS_W} nowMinutes={nowMinutes} />
        )}
      </div>
    </div>
  );
}
