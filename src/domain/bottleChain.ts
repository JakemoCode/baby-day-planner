import type { Day, Event, Settings } from "./types";
import { addMinutes, parseTime } from "./time";
import { intervalForAmount } from "./bottleRules";

const HARD_STOP_MINUTES = 23 * 60;

export function projectBottleChain(actuals: Event[], settings: Settings, day: Day): Event[] {
  const bottleActuals = actuals
    .filter((e) => e.type === "bottle" && (e.source === "actual" || e.source === "manual"))
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));

  if (bottleActuals.length === 0) return [];

  const out: Event[] = [...bottleActuals];

  const anchor = bottleActuals[bottleActuals.length - 1]!;
  const anchorIdx = parseInt(anchor.eventKey.replace("bottle_", ""), 10);
  let cursorTime = anchor.startTime;
  let cursorAmount = anchor.amountOz;

  let n = anchorIdx + 1;
  while (true) {
    const interval = intervalForAmount(
      settings.bottleRules,
      cursorAmount,
      settings.defaultBottleIntervalMinutes,
    );
    const nextStart = addMinutes(cursorTime, interval);
    if (parseTime(nextStart) >= HARD_STOP_MINUTES) break;
    out.push({
      id: `proj-${day.id}-bottle-${n}`,
      dayId: day.id,
      eventKey: `bottle_${n}`,
      type: "bottle",
      label: `Bottle ${n}`,
      startTime: nextStart,
      amountOz: settings.defaultBottleAmountOz,
      source: "projected",
      status: "projected",
    });
    cursorTime = nextStart;
    cursorAmount = settings.defaultBottleAmountOz;
    n++;
    if (n > 12) break;
  }

  return out.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
