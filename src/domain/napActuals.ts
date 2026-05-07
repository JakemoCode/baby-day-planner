import type { Event, Settings } from "./types";
import { addMinutes, diffMinutes, parseTime } from "./time";

export function applyNapActuals(projected: Event[], actuals: Event[], settings: Settings): Event[] {
  const napActualsByKey = new Map<string, Event>();
  for (const a of actuals) {
    if (a.type === "nap") napActualsByKey.set(a.eventKey, a);
  }
  if (napActualsByKey.size === 0) return projected;

  const result: Event[] = [];
  const wake = projected.find((e) => e.type === "wake");
  if (wake) result.push(wake);

  let cursor = wake?.startTime ?? "00:00";
  const napCount = projected.filter((e) => e.type === "nap").length;

  for (let i = 1; i <= napCount; i++) {
    const wwKey = `wake_window_${i}`;
    const napKey = `nap_${i}`;
    const projWw = projected.find((e) => e.eventKey === wwKey);
    const projNap = projected.find((e) => e.eventKey === napKey);
    if (!projWw || !projNap) continue;

    const projWwMinutes = diffMinutes(projWw.endTime!, projWw.startTime);
    const prevNapActual = i > 1 ? napActualsByKey.get(`nap_${i - 1}`) : undefined;
    const prevDur =
      prevNapActual && prevNapActual.endTime
        ? diffMinutes(prevNapActual.endTime, prevNapActual.startTime)
        : undefined;
    const isShortPrev = prevDur !== undefined && prevDur < settings.shortNapThresholdMinutes;
    const wwMinutes = isShortPrev
      ? projWwMinutes - settings.shortNapAdjustmentMinutes
      : projWwMinutes;

    const wwStart = cursor;
    let wwEnd = addMinutes(wwStart, wwMinutes);

    const napActual = napActualsByKey.get(napKey);
    // When the actual nap is recorded, the wake window MUST end exactly at
    // the actual nap's start. Stretches forward (late nap) AND shrinks
    // back (early nap) — anything else creates a wake-window/nap visual
    // overlap on the timeline. If the actual is logically impossible
    // (starts before the previous nap ended → wwStart > napStart), the
    // WW collapses to a zero-length sliver rather than rendering inverted.
    if (napActual) {
      const napStartMin = parseTime(napActual.startTime);
      wwEnd = napStartMin < parseTime(wwStart) ? wwStart : napActual.startTime;
    }

    result.push({
      ...projWw,
      startTime: wwStart,
      endTime: wwEnd,
    });

    if (napActual) {
      const napStart = napActual.startTime;
      const napEnd = napActual.endTime ?? addMinutes(napStart, settings.defaultNapLengthMinutes);
      result.push({ ...projNap, ...napActual, startTime: napStart, endTime: napEnd });
      cursor = napEnd;
    } else {
      const napStart = wwEnd;
      const napEnd = addMinutes(napStart, settings.defaultNapLengthMinutes);
      result.push({ ...projNap, startTime: napStart, endTime: napEnd });
      cursor = napEnd;
    }
  }

  return result.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
