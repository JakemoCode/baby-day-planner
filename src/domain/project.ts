import type { Event, ProjectInput } from "./types";
import { projectNapChain } from "./napChain";
import { applyNapActuals } from "./napActuals";
import { applyBedtime } from "./bedtime";
import { addPutdownEvents } from "./putdown";
import { projectBottleChain, renumberBottles } from "./bottleChain";
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

  // 2b. Merge user-edited wake_window overrides BEFORE bedtime so a manual
  //     wake_window with an endTime past bedtime gets clipped correctly.
  events = applyWakeWindowOverrides(events, actuals);

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

  // 7b. Renumber bottles so eventKey/label always reflect chronological
  //     order — manual overrides + cascade can produce non-monotonic
  //     numbering otherwise.
  events = renumberBottles(events);

  // 8. Dream feed (honors a user override if present)
  events = addDreamFeed(events, settings, day, actuals);

  // 9. Pumps + extras
  events = mergePumpsAndExtras(events, actuals, settings, day);

  // 10. Apply ownership template (last, so it sees putdown + final nap shape).
  //     applyTemplate skips events whose owner is already set, so manual
  //     overrides win over template defaults.
  if (template) events = applyTemplate(events, template);

  return events.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
