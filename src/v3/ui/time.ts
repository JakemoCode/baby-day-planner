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
