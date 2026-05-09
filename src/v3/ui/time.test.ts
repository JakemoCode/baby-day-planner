/**
 * V3 time formatters — TimeMin → display strings at the UI boundary.
 * Engine stays in integer minutes; rendering is the only place that
 * builds human-readable time.
 */

import { describe, expect, it } from "vitest";
import { formatHM24, formatTimeForDisplay, formatTimeShort } from "./time";

describe("formatHM24 — TimeMin → 'HH:MM' (zero-padded 24h)", () => {
  it("formats midnight", () => {
    expect(formatHM24(0)).toBe("00:00");
  });
  it("formats single-digit hours with leading zero", () => {
    expect(formatHM24(7 * 60 + 5)).toBe("07:05");
  });
  it("formats afternoon hours", () => {
    expect(formatHM24(13 * 60 + 30)).toBe("13:30");
  });
  it("wraps cross-day TimeMin (>= 24h) into the next-day clock face", () => {
    expect(formatHM24(25 * 60 + 15)).toBe("01:15");
  });
});

describe("formatTimeForDisplay — TimeMin → 'H:MM AM/PM'", () => {
  it("midnight reads as 12 AM", () => {
    expect(formatTimeForDisplay(0)).toBe("12:00 AM");
  });
  it("noon reads as 12 PM", () => {
    expect(formatTimeForDisplay(12 * 60)).toBe("12:00 PM");
  });
  it("morning hours drop the leading zero", () => {
    expect(formatTimeForDisplay(7 * 60 + 5)).toBe("7:05 AM");
  });
  it("afternoon hours convert to 12-hour", () => {
    expect(formatTimeForDisplay(13 * 60 + 30)).toBe("1:30 PM");
  });
  it("cross-day TimeMin wraps cleanly", () => {
    expect(formatTimeForDisplay(25 * 60 + 15)).toBe("1:15 AM");
  });
});

describe("formatTimeShort — TimeMin → tight axis form", () => {
  it("whole hours drop the colon-zero", () => {
    expect(formatTimeShort(10 * 60)).toBe("10a");
    expect(formatTimeShort(13 * 60)).toBe("1p");
    expect(formatTimeShort(0)).toBe("12a");
    expect(formatTimeShort(12 * 60)).toBe("12p");
  });
  it("non-whole hours keep minutes with no space before suffix", () => {
    expect(formatTimeShort(13 * 60 + 5)).toBe("1:05p");
    expect(formatTimeShort(7 * 60 + 30)).toBe("7:30a");
  });
  it("cross-day TimeMin wraps", () => {
    expect(formatTimeShort(25 * 60)).toBe("1a");
  });
});
