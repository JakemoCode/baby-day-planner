/**
 * Parent-talk age formatting.
 *
 * The branching at thresholds (14 days, 12 weeks, 24 months) and the
 * calendar-month math at line 46-47 (subtract a month if now.date <
 * birth.date) are exactly the kind of off-by-one that types can't
 * guard. Table-driven with an explicit `now` to keep CI deterministic.
 */

import { describe, expect, it, test } from "vitest";
import { formatAge } from "./Header";

// Local-date constructor (NOT `new Date("2026-05-26")` — that's UTC
// midnight and skews .getMonth()/.getDate() in any non-UTC timezone,
// which is exactly the off-by-one this function exists to avoid.
const NOW = new Date(2026, 4, 26); // May 26 2026, local

describe("formatAge", () => {
  test.each<[string, string]>([
    // Days (< 14)
    ["2026-05-26", "0 days"],
    ["2026-05-25", "1 day"],
    ["2026-05-24", "2 days"],
    ["2026-05-13", "13 days"],
    // Week boundary at 14 days
    ["2026-05-12", "2 weeks"],
    ["2026-05-05", "3 weeks"],
    // Month boundary at 12 weeks (~84 days). 2026-03-02 → 85 days → 12 weeks → months path.
    ["2026-03-02", "2 months"],
    // Calendar-month math: now=May 26, birth=Feb 27 → months = 3 then -1 (now.date 26 < birth.date 27) → 2 months
    ["2026-02-27", "2 months"],
    // Year boundary at 24 months
    ["2024-05-26", "2 years"],
    ["2024-05-27", "23 months"],
    ["2022-05-26", "4 years"],
  ])("dob %s with now=2026-05-26 → %s", (dob, expected) => {
    expect(formatAge(dob, NOW)).toBe(expected);
  });

  it("returns empty string for a future dob", () => {
    expect(formatAge("2026-12-01", NOW)).toBe("");
  });

  it("pluralizes day singular vs plural correctly", () => {
    expect(formatAge("2026-05-25", NOW)).toBe("1 day");
    expect(formatAge("2026-05-24", NOW)).toBe("2 days");
  });
});
