import { describe, it, expect } from "vitest";
import type { Event, OwnershipTemplate } from "./types";
import { applyTemplate, flipTemplate, copyToOtherDay } from "./owners";
import { saturdayTemplate, sampleDay } from "./__fixtures__/sample";

const evt = (
  type: Event["type"],
  eventKey: string,
  start = "07:00",
): Event => ({
  id: eventKey,
  dayId: sampleDay.id,
  eventKey,
  type,
  label: eventKey,
  startTime: start,
  source: "projected",
  status: "projected",
});

describe("applyTemplate", () => {
  it("assigns nap and wake-window owners by index", () => {
    const events = [
      evt("wake_window", "wake_window_1"),
      evt("nap", "nap_1"),
      evt("wake_window", "wake_window_2"),
      evt("nap", "nap_2"),
    ];
    const result = applyTemplate(events, saturdayTemplate);
    expect(result.find((e) => e.eventKey === "nap_1")?.owner).toBe("Kelly");
    expect(result.find((e) => e.eventKey === "nap_2")?.owner).toBe("Jake");
    expect(result.find((e) => e.eventKey === "wake_window_1")?.owner).toBe("Jake");
    expect(result.find((e) => e.eventKey === "wake_window_2")?.owner).toBe("Kelly");
  });

  it("does not overwrite existing owner overrides", () => {
    const overridden: Event = { ...evt("nap", "nap_1"), owner: "Daycare", source: "manual" };
    const result = applyTemplate([overridden], saturdayTemplate);
    expect(result[0]?.owner).toBe("Daycare");
  });

  it("propagates nap owner to corresponding putdown event", () => {
    const events = [evt("nap", "nap_1"), evt("putdown", "nap_1_putdown")];
    const result = applyTemplate(events, saturdayTemplate);
    expect(result.find((e) => e.type === "putdown")?.owner).toBe("Kelly");
  });
});

describe("flipTemplate", () => {
  it("swaps Jake ↔ Kelly leaving Daycare alone", () => {
    const t: OwnershipTemplate = {
      id: "x",
      label: "Y",
      napOwners: ["Jake", "Kelly", "Daycare"],
      wakeWindowOwners: ["Kelly", "Jake"],
    };
    const flipped = flipTemplate(t);
    expect(flipped.napOwners).toEqual(["Kelly", "Jake", "Daycare"]);
    expect(flipped.wakeWindowOwners).toEqual(["Jake", "Kelly"]);
  });
});

describe("copyToOtherDay", () => {
  it("returns a flipped clone with new id and label", () => {
    const sunday = copyToOtherDay(saturdayTemplate, "tmpl-sunday", "Sunday");
    expect(sunday.id).toBe("tmpl-sunday");
    expect(sunday.label).toBe("Sunday");
    expect(sunday.napOwners[0]).toBe("Jake");
    expect(sunday.napOwners[1]).toBe("Kelly");
  });
});
