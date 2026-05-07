import { describe, it, expect } from "vitest";
import type { Event, OwnershipTemplate } from "./types";
import { makeEvent } from "./types";
import { applyTemplate, flipTemplate, copyToOtherDay } from "./owners";
import { saturdayTemplate, sampleDay } from "./__fixtures__/sample";

const evt = (type: Event["type"], eventKey: string, start = "07:00"): Event =>
  makeEvent({
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
  it("assigns nap owners by index, and wake-windows inherit from the same nap index", () => {
    // Wake Window N is the period leading into Nap N — same parent on duty,
    // so wake_window_N owner = nap_N owner. Legacy wakeWindowOwners is
    // ignored when napOwners[i] is set.
    const events = [
      evt("wake_window", "wake_window_1"),
      evt("nap", "nap_1"),
      evt("wake_window", "wake_window_2"),
      evt("nap", "nap_2"),
    ];
    const result = applyTemplate(events, saturdayTemplate);
    expect(result.find((e) => e.eventKey === "nap_1")?.owner).toBe("Kelly");
    expect(result.find((e) => e.eventKey === "nap_2")?.owner).toBe("Jake");
    expect(result.find((e) => e.eventKey === "wake_window_1")?.owner).toBe("Kelly");
    expect(result.find((e) => e.eventKey === "wake_window_2")?.owner).toBe("Jake");
  });

  it("falls back to wakeWindowOwners when napOwners[i] is missing", () => {
    const partialTemplate: OwnershipTemplate = {
      id: "partial",
      label: "Partial",
      napOwners: [], // empty
      wakeWindowOwners: ["Daycare", "Daycare"],
    };
    const events = [evt("wake_window", "wake_window_1")];
    const result = applyTemplate(events, partialTemplate);
    expect(result[0]?.owner).toBe("Daycare");
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

describe("applyTemplate edge cases", () => {
  it("leaves nap event unchanged when index is out of template range", () => {
    const t: OwnershipTemplate = {
      id: "t",
      label: "T",
      napOwners: ["Kelly"],
      wakeWindowOwners: ["Jake"],
    };
    // nap_5 → index 4, template only has 1 entry → o is undefined → event unchanged
    const events = [evt("nap", "nap_5")];
    const result = applyTemplate(events, t);
    expect(result[0]?.owner).toBeUndefined();
  });

  it("leaves wake_window unchanged when index is out of template range", () => {
    const t: OwnershipTemplate = {
      id: "t",
      label: "T",
      napOwners: ["Kelly"],
      wakeWindowOwners: ["Jake"],
    };
    const events = [evt("wake_window", "wake_window_5")];
    const result = applyTemplate(events, t);
    expect(result[0]?.owner).toBeUndefined();
  });

  it("leaves unrecognised eventKey unchanged (napIndex returns -1)", () => {
    const t: OwnershipTemplate = {
      id: "t",
      label: "T",
      napOwners: ["Kelly"],
      wakeWindowOwners: ["Jake"],
    };
    // eventKey "nap_x" does not match /^nap_(\d+)/ → index -1 → event unchanged
    const events = [evt("nap", "nap_x")];
    const result = applyTemplate(events, t);
    expect(result[0]?.owner).toBeUndefined();
  });

  it("leaves putdown unchanged when putdown eventKey has no digit", () => {
    const t: OwnershipTemplate = {
      id: "t",
      label: "T",
      napOwners: ["Kelly"],
      wakeWindowOwners: [],
    };
    const events = [evt("putdown", "putdown_misc")];
    const result = applyTemplate(events, t);
    expect(result[0]?.owner).toBeUndefined();
  });

  it("leaves bottle event unchanged when template has no bottleOwners", () => {
    const events = [evt("bottle", "bottle_1")];
    const result = applyTemplate(events, saturdayTemplate);
    expect(result[0]?.owner).toBeUndefined();
  });

  it("assigns bottle owners by index when bottleOwners is set", () => {
    const t: OwnershipTemplate = {
      ...saturdayTemplate,
      bottleOwners: ["Kelly", "Jake", "Daycare"],
    };
    const events = [
      evt("bottle", "bottle_1"),
      evt("bottle", "bottle_2"),
      evt("bottle", "bottle_3"),
    ];
    const result = applyTemplate(events, t);
    expect(result[0]?.owner).toBe("Kelly");
    expect(result[1]?.owner).toBe("Jake");
    expect(result[2]?.owner).toBe("Daycare");
  });

  it("leaves bottle unchanged when index is out of bottleOwners range", () => {
    const t: OwnershipTemplate = {
      ...saturdayTemplate,
      bottleOwners: ["Kelly"],
    };
    const events = [evt("bottle", "bottle_5")];
    const result = applyTemplate(events, t);
    expect(result[0]?.owner).toBeUndefined();
  });
});

describe("flipTemplate with bottleOwners", () => {
  it("flips Jake ↔ Kelly in bottleOwners and preserves Daycare", () => {
    const t: OwnershipTemplate = {
      id: "x",
      label: "Y",
      napOwners: [],
      wakeWindowOwners: [],
      bottleOwners: ["Jake", "Kelly", "Daycare"],
    };
    expect(flipTemplate(t).bottleOwners).toEqual(["Kelly", "Jake", "Daycare"]);
  });

  it("omits bottleOwners in output when input has none", () => {
    const t: OwnershipTemplate = {
      id: "x",
      label: "Y",
      napOwners: ["Jake"],
      wakeWindowOwners: ["Kelly"],
    };
    expect(flipTemplate(t).bottleOwners).toBeUndefined();
  });
});
