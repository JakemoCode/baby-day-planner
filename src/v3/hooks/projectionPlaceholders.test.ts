import { describe, expect, it } from "vitest";
import type { Day, Settings } from "../schemas";
import { PLACEHOLDER_DAY, PLACEHOLDER_SETTINGS } from "./projectionPlaceholders";

describe("projectionPlaceholders", () => {
  it("exports a PLACEHOLDER_DAY conforming to Day", () => {
    // Type assertion via assignment — file fails to typecheck if the
    // shape ever drifts from `Day`.
    const day: Day = PLACEHOLDER_DAY;
    expect(day.status).toBe("active");
    expect(day.suppressedDaycareDay).toBe(false);
    expect(day.suppressedRecurringIds).toEqual([]);
    expect(day.wakeTime).toBeUndefined();
  });

  it("exports a PLACEHOLDER_SETTINGS conforming to Settings", () => {
    const settings: Settings = PLACEHOLDER_SETTINGS;
    expect(settings.defaultWakeTime).toBe(7 * 60);
    expect(settings.owners.parent1.displayName).toBe("");
    expect(settings.daycare.enabled).toBe(false);
  });
});
