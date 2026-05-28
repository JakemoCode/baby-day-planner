/**
 * Age formatting — threshold branching (14 days, 12 weeks, 24 months) and
 * calendar-month math are off-by-one-prone; table-driven with explicit `now`
 * to keep CI deterministic.
 */

import { describe, expect, it, test } from "vitest";
import { formatAge } from "./Header";

// Local-date constructor (NOT `new Date("2026-05-26")` — UTC midnight skews
// .getMonth()/.getDate() in non-UTC timezones).
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
    // 12 weeks → months path (strict `<`); weeks=11 side omitted because the
    // day-count loses an hour on DST and flakes near the boundary.
    ["2026-03-02", "2 months"],
    // Branch A: May 26 + Feb 27 birth → 3 months -1 (26 < 27) = 2 months
    ["2026-02-27", "2 months"],
    // Branch B: anniversary day, no adjustment. Pins equality side of `now.date < birth.date`;
    // flipping `<` to `<=` would silently render "11 months".

    ["2025-05-26", "12 months"],
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
});
