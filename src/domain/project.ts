import type { Event, ProjectInput } from "./types";
import { projectNapChain } from "./napChain";
import { applyNapActuals } from "./napActuals";
import { applyBedtime } from "./bedtime";
import { addPutdownEvents } from "./putdown";
import { projectBottleChain } from "./bottleChain";
import { resolveBottleNapOverlap } from "./bottleOverlap";
import { suppressBottlesAfterBedtime } from "./bottleSuppress";
import { addDreamFeed } from "./dreamFeed";
import { mergePumpsAndExtras } from "./extras";
import { applyTemplate } from "./owners";
import { applyWakeWindowOverrides } from "./wakeWindowOverrides";
import { parseTime } from "./time";

export function projectDay(input: ProjectInput): Event[] {
  const { day, settings, actuals, template, nowMinutes = 24 * 60 } = input;

  // 1. Base nap chain from wake time
  let events: Event[] = projectNapChain(day, settings);

  // 2. Apply nap actuals + short-nap adjustment
  events = applyNapActuals(events, actuals, settings);

  // 3. Substitute bedtime for late naps (or honor a user override from actuals)
  events = applyBedtime(events, settings, actuals);

  // 4. Generate putdown events for remaining projected naps + bedtime
  events = addPutdownEvents(events, settings);

  // 5. Bottle chain from latest bottle actual
  const bottles = projectBottleChain(actuals, settings, day);
  events = [...events, ...bottles];

  // 6. Resolve bottle/nap overlap and re-anchor
  events = resolveBottleNapOverlap(events, settings, day, nowMinutes);

  // 7. Suppress projected bottles past bedtime
  events = suppressBottlesAfterBedtime(events, settings);

  // 8. Dream feed
  events = addDreamFeed(events, settings, day);

  // 9. Pumps + extras
  events = mergePumpsAndExtras(events, actuals, settings, day);

  // 10. Merge any user-edited wake_window overrides by eventKey so manual
  //     owner / time tweaks survive into the final projection.
  events = applyWakeWindowOverrides(events, actuals);

  // 11. Apply ownership template (last, so it sees putdown + final nap shape).
  //     applyTemplate skips events whose owner is already set, so manual
  //     overrides win over template defaults.
  if (template) events = applyTemplate(events, template);

  return events.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
