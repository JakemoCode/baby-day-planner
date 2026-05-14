/**
 * UI-boundary time formatters. Engine stays in TimeMin (integer minutes
 * since local midnight, with cross-day values >= 1440); these convert to
 * display strings only when rendering.
 *
 * Cross-day TimeMin (e.g. dream feed at 25:15) is wrapped with `% 1440`
 * so a 25:15 minute count renders as "1:15 AM" the way humans read clocks.
 */

import type { TimeMin } from "../schemas";

const MINUTES_PER_DAY = 24 * 60;

function clockFace(minutes: TimeMin): { h24: number; m: number } {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return { h24: Math.floor(wrapped / 60), m: wrapped % 60 };
}

export function formatHM24(minutes: TimeMin): string {
  const { h24, m } = clockFace(minutes);
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Inverse of `formatHM24`. Parses an "HH:MM" 24-hour string (the format
 * `<input type="time">` emits) into a TimeMin. Returns `undefined` for
 * malformed or out-of-range input — callers decide how to handle it
 * (typically: ignore the change so the field's previous value sticks).
 */
export function parseHM24(raw: string): TimeMin | undefined {
  const m = /^(\d{2}):(\d{2})$/.exec(raw);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return undefined;
  if (h < 0 || h > 23 || min < 0 || min > 59) return undefined;
  return h * 60 + min;
}

export function formatTimeForDisplay(minutes: TimeMin): string {
  const { h24, m } = clockFace(minutes);
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatTimeShort(minutes: TimeMin): string {
  const { h24, m } = clockFace(minutes);
  const period = h24 >= 12 ? "p" : "a";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

/**
 * Compact time-range formatter used for all duration displays on the
 * timeline. Output shapes:
 *   - same period (most ranges):    "1 - 1:15p", "9:30 - 10a"
 *   - cross period (bedtime etc.):  "10p - 7a"
 *
 * Period suffix is dropped from the start when start and end share it,
 * because the trailing "a"/"p" applies to the whole range.
 */
export function formatRangeShort(start: TimeMin, end: TimeMin): string {
  const s = formatTimeShort(start);
  const e = formatTimeShort(end);
  const sP = s.slice(-1);
  const eP = e.slice(-1);
  if (sP === eP) {
    return `${s.slice(0, -1)} - ${e}`;
  }
  return `${s} - ${e}`;
}

/**
 * Format a non-negative minute count as a compact hours/minutes string.
 *   45 → "45m"
 *   60 → "1h"
 *   65 → "1h 5m"
 * Used by dashboard previews for both deltas (caller concats "in ") and
 * durations.
 */
export function formatHoursMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Read the wall clock and return the current local time as a TimeMin
 * (minutes since local midnight). Used by action buttons that log
 * "now" events.
 */
export function currentLocalMinutes(): TimeMin {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
