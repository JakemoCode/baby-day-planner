import { describe, expect, it } from "vitest";
import { missingScheduledEvents } from "./missingScheduledEvents";

describe("missingScheduledEvents", () => {
  it("returns all entries when existing is empty", () => {
    const entries = [
      { eventKey: "pump_07:00", startTime: 420 },
      { eventKey: "pump_14:30", startTime: 870 },
    ];
    expect(missingScheduledEvents(entries, [])).toEqual(entries);
  });

  it("returns only entries whose eventKeys are not in existing", () => {
    const entries = [
      { eventKey: "pump_07:00", startTime: 420 },
      { eventKey: "pump_14:30", startTime: 870 },
      { eventKey: "pump_20:00", startTime: 1200 },
    ];
    const existing = [{ eventKey: "pump_07:00" }, { eventKey: "pump_20:00" }];
    const result = missingScheduledEvents(entries, existing);
    expect(result).toHaveLength(1);
    expect(result[0]!.eventKey).toBe("pump_14:30");
  });

  it("returns [] when all entries' eventKeys are present in existing", () => {
    const entries = [{ eventKey: "recurring:bath" }, { eventKey: "recurring:dinner" }];
    const existing = [{ eventKey: "recurring:bath" }, { eventKey: "recurring:dinner" }];
    expect(missingScheduledEvents(entries, existing)).toEqual([]);
  });
});
