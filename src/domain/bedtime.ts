import type { Event, Settings } from "./types";
import { makeEvent } from "./types";
import { parseTime } from "./time";

/**
 * Bedtime extends until the next morning's wake. Without next-day data on
 * today's projection, default the endTime to the end of the timeline's
 * extended viewport so the block visually carries through the night and
 * into the empty morning hours. Once the next "Start New Day" is pressed,
 * a new Day record begins fresh — the previous day's bedtime is archived.
 */
const BEDTIME_DEFAULT_END = "30:00"; // 6 AM next day, expressed as 24+ hours

export function applyBedtime(events: Event[], settings: Settings, actuals: Event[] = []): Event[] {
  // Honor a user-supplied (manual / actual) bedtime first — it represents an
  // explicit override of the projected schedule. Trim naps and wake windows
  // that fall at/after the override time and use that bedtime as canonical.
  const userBedtime = actuals.find(
    (e) => e.type === "bedtime" && (e.source === "manual" || e.source === "actual"),
  );
  if (userBedtime) {
    const bedMins = parseTime(userBedtime.startTime);
    // First pass: drop bedtime-eclipsed naps and clip wake_windows that
    // cross bedtime. Track which nap eventKeys got dropped so the second
    // pass can stretch the wake_window leading into them up to bedtime
    // (otherwise a gap renders between WW end and the bedtime chip,
    // making the bedtime putdown look orphaned).
    const droppedNapKeys = new Set<string>();
    const trimmed = events.flatMap((e): Event[] => {
      if (e.type === "bedtime") return [];
      if (e.type === "nap") {
        if (parseTime(e.startTime) >= bedMins) {
          droppedNapKeys.add(e.eventKey);
          return [];
        }
        if (e.endTime && parseTime(e.endTime) > bedMins) {
          droppedNapKeys.add(e.eventKey);
          return [];
        }
      }
      if (e.type === "wake_window") {
        if (parseTime(e.startTime) >= bedMins) return [];
        if (e.endTime && parseTime(e.endTime) > bedMins) {
          return [{ ...e, endTime: userBedtime.startTime }];
        }
      }
      return [e];
    });

    // Second pass: a wake_window whose corresponding nap was dropped
    // should stretch to bedtime — the baby is awake right up until it.
    // Match by eventKey index (wake_window_N → nap_N).
    const stretched = trimmed.map((e) => {
      if (e.type !== "wake_window") return e;
      const m = /^wake_window_(\d+)/.exec(e.eventKey);
      if (!m) return e;
      const napKey = `nap_${m[1]}`;
      if (!droppedNapKeys.has(napKey)) return e;
      if (e.endTime && parseTime(e.endTime) >= bedMins) return e;
      return { ...e, endTime: userBedtime.startTime };
    });

    // Manual / actual bedtime is a block now — give it an endTime if the
    // user didn't provide one (most won't; they tap a time, not a range).
    const userBedtimeWithEnd: Event = userBedtime.endTime
      ? userBedtime
      : { ...userBedtime, endTime: BEDTIME_DEFAULT_END, kind: "block" };

    return [...stretched, userBedtimeWithEnd].sort(
      (a, b) => parseTime(a.startTime) - parseTime(b.startTime),
    );
  }

  const bedtimeMins = parseTime(settings.bedtimeThreshold);
  const naps = events.filter((e) => e.type === "nap");
  const replaceIdx = naps.findIndex((n) => parseTime(n.startTime) >= bedtimeMins);
  if (replaceIdx === -1) return events;

  const napToReplace = naps[replaceIdx]!;
  const out = events
    .filter((e) => {
      if (e.id === napToReplace.id) return false;
      if (e.type === "nap" && parseTime(e.startTime) >= bedtimeMins) return false;
      if (e.type === "wake_window" && parseTime(e.startTime) >= parseTime(napToReplace.startTime)) {
        return false;
      }
      return true;
    })
    .concat([
      makeEvent({
        id: `proj-${napToReplace.dayId}-bedtime`,
        dayId: napToReplace.dayId,
        eventKey: "bedtime",
        type: "bedtime",
        label: "Bedtime",
        startTime: napToReplace.startTime,
        endTime: BEDTIME_DEFAULT_END,
        source: "projected",
        status: "projected",
      }),
    ]);

  return out.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
