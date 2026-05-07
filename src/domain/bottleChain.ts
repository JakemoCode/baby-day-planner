import type { Day, Event, Settings } from "./types";
import { makeEvent } from "./types";
import { addMinutes, parseTime } from "./time";
import { intervalForAmount } from "./bottleRules";

const HARD_STOP_MINUTES = 23 * 60;

export function projectBottleChain(actuals: Event[], settings: Settings, day: Day): Event[] {
  const bottleActuals = actuals
    .filter((e) => e.type === "bottle" && (e.source === "actual" || e.source === "manual"))
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));

  if (bottleActuals.length === 0) return [];

  const out: Event[] = [...bottleActuals];

  // Anchor:
  //   - cursor time/amount comes from the LATEST-by-time actual (where the
  //     next interval cascades from).
  //   - eventKey index comes from the MAX existing key index across all
  //     bottle actuals (so we never generate a duplicate `bottle_N` if a
  //     stray manual override carries a higher index than the latest-by-
  //     time bottle — exactly the bug Jake hit: a bottle_4 manual at noon
  //     plus a bottle_3 actual in the afternoon caused two bottle_4 docs).
  const anchor = bottleActuals[bottleActuals.length - 1]!;
  let cursorTime = anchor.startTime;
  let cursorAmount = anchor.amountOz;

  let maxKeyIdx = 0;
  for (const a of bottleActuals) {
    const m = /bottle_(\d+)/.exec(a.eventKey);
    if (m && m[1]) {
      const idx = parseInt(m[1], 10);
      if (Number.isFinite(idx) && idx > maxKeyIdx) maxKeyIdx = idx;
    }
  }
  let n = maxKeyIdx + 1;
  while (true) {
    const interval = intervalForAmount(
      settings.bottleRules,
      cursorAmount,
      settings.defaultBottleIntervalMinutes,
    );
    const nextStart = addMinutes(cursorTime, interval);
    if (parseTime(nextStart) >= HARD_STOP_MINUTES) break;
    out.push(
      makeEvent({
        id: `proj-${day.id}-bottle-${n}`,
        dayId: day.id,
        eventKey: `bottle_${n}`,
        type: "bottle",
        label: `Bottle ${n}`,
        startTime: nextStart,
        amountOz: settings.defaultBottleAmountOz,
        source: "projected",
        status: "projected",
      }),
    );
    cursorTime = nextStart;
    cursorAmount = settings.defaultBottleAmountOz;
    n++;
    if (n > 12) break;
  }

  return out.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
