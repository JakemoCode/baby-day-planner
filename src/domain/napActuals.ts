import type { Event, Settings } from "./types";
import { addMinutes, diffMinutes, parseTime } from "./time";

/**
 * Two kinds of nap "actuals" exist in the inputs:
 *
 *   - Recorded (`recorded: true`): user committed a specific time. The
 *     wake window must end exactly at the actual's start; subsequent
 *     events cascade from the actual's end.
 *   - Unrecorded annotation (`recorded: false`): user set owner/label on
 *     a not-yet-happened nap via the drawer. We carry the owner forward
 *     but ignore the stored times — the cascade computes them. This lets
 *     a future nap recompute freely while still picking up the owner the
 *     user assigned.
 */
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
    // Only RECORDED prior naps drive short-nap wake-window adjustment;
    // an unrecorded annotation has no real duration to learn from.
    const prevDur =
      prevNapActual && prevNapActual.recorded && prevNapActual.endTime
        ? diffMinutes(prevNapActual.endTime, prevNapActual.startTime)
        : undefined;
    const isShortPrev = prevDur !== undefined && prevDur < settings.shortNapThresholdMinutes;
    const wwMinutes = isShortPrev
      ? projWwMinutes - settings.shortNapAdjustmentMinutes
      : projWwMinutes;

    const wwStart = cursor;
    let wwEnd = addMinutes(wwStart, wwMinutes);

    const napActual = napActualsByKey.get(napKey);

    // Recorded actuals pin times: clamp wwEnd to the actual's start so
    // wake/nap don't overlap visually. Unrecorded annotations are ignored
    // for time purposes (cascade owns the time).
    if (napActual && napActual.recorded) {
      const napStartMin = parseTime(napActual.startTime);
      wwEnd = napStartMin < parseTime(wwStart) ? wwStart : napActual.startTime;
    }

    result.push({
      ...projWw,
      startTime: wwStart,
      endTime: wwEnd,
    });

    if (napActual && napActual.recorded) {
      // Recorded — use the actual's times exactly.
      const napStart = napActual.startTime;
      const napEnd = napActual.endTime ?? addMinutes(napStart, settings.defaultNapLengthMinutes);
      result.push({ ...projNap, ...napActual, startTime: napStart, endTime: napEnd });
      cursor = napEnd;
    } else if (napActual) {
      // Unrecorded annotation — cascade-driven time, but carry forward
      // the user's owner / label / kind. Don't spread time fields.
      const napStart = wwEnd;
      const napEnd = addMinutes(napStart, settings.defaultNapLengthMinutes);
      const merged: Event = {
        ...projNap,
        ...(napActual.owner !== undefined ? { owner: napActual.owner } : {}),
        label: napActual.label || projNap.label,
        startTime: napStart,
        endTime: napEnd,
      };
      result.push(merged);
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
