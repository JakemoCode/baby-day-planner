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

export type UseV3ProjectionInput = {
  day: Day;
  settings: Settings;
  actuals: Event[];
  template?: OwnershipTemplate;
};

export function useV3Projection(input: UseV3ProjectionInput): Event[] {
  const nowMinutes = useNowMinutes();
  return projectDay({
    day: input.day,
    settings: input.settings,
    actuals: input.actuals,
    nowMinutes,
    ...(input.template !== undefined ? { template: input.template } : {}),
  });
}
