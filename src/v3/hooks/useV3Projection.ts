"use client";

/**
 * V3 projection hook. Composes the engine, the per-render `nowMinutes`
 * clock, and the caller's day/settings/actuals into a sorted Event[]
 * ready for the timeline.
 *
 * The engine is pure — recomputing on every render is sub-millisecond
 * and side-effect-free, so we do not memoize. The 30s `useNowMinutes`
 * tick is what drives "in 12 min" deltas to refresh.
 */

import { useNowMinutes } from "../../hooks/useNowMinutes";
import { projectDay } from "../engine/projectDay";
import type { Day, Event, OwnershipTemplate, Settings } from "../schemas";
import { applyDreamFeedLabel } from "../ui/dreamFeedLabel";

export type UseV3ProjectionInput = {
  day: Day;
  settings: Settings;
  actuals: Event[];
  template?: OwnershipTemplate;
};

export function useV3Projection(input: UseV3ProjectionInput): Event[] {
  const nowMinutes = useNowMinutes();
  const events = projectDay({
    day: input.day,
    settings: input.settings,
    actuals: input.actuals,
    nowMinutes,
    ...(input.template !== undefined ? { template: input.template } : {}),
  });
  // TEMP DIAGNOSTIC (PR #139 click-test): remove before merge.
  const bedtime = events.find((e) => e.type === "bedtime");
  const bottles = events
    .filter((e) => e.type === "bottle")
    .map((e) => ({
      id: e.id,
      key: e.eventKey,
      start: e.startTime,
      label: e.label,
      state: e.lifecycle.state,
    }));
  // eslint-disable-next-line no-console
  console.log("[dreamFeed-debug]", {
    dreamFeedEnabled: input.settings.dreamFeedEnabled,
    bedtimeStart: bedtime?.startTime,
    bedtimeState: bedtime?.lifecycle.state,
    bottles,
  });
  return applyDreamFeedLabel(events, input.settings);
}
