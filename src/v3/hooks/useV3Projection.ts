"use client";

/**
 * Composes engine + nowMinutes + day/settings/actuals into a sorted Event[] for the timeline.
 * Not memoized: engine is pure and sub-millisecond; the 30s tick drives delta refreshes.
 */

import { useNowMinutes } from "../../hooks/useNowMinutes";
import { projectDay } from "../engine/projectDay";
import type { Day, Event, OwnershipTemplate, Settings } from "../schemas";
import { renderProjection } from "../ui/renderProjection";

export type UseV3ProjectionInput = {
  day: Day | null;
  settings: Settings | null;
  actuals: Event[];
  template?: OwnershipTemplate;
};

export function useV3Projection(input: UseV3ProjectionInput): Event[] {
  const nowMinutes = useNowMinutes();
  if (input.day === null || input.settings === null) {
    return [];
  }
  const events = projectDay({
    day: input.day,
    settings: input.settings,
    actuals: input.actuals,
    nowMinutes,
    ...(input.template !== undefined ? { template: input.template } : {}),
  });
  return renderProjection(events, input.settings, nowMinutes);
}
