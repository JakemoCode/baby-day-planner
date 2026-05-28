/** applyDreamFeedLabel — render-time relabeling (SIMPLIFICATION_SCOPE.md §3). */

import { describe, expect, it } from "vitest";
import {
  aProjectedBedtime,
  aProjectedBottle,
  aRecordedBottle,
  aSettings,
} from "../__tests__/factories";
import type { Event } from "../schemas";
import { applyDreamFeedLabel } from "./dreamFeedLabel";

describe("applyDreamFeedLabel", () => {
  it("returns events unchanged when dreamFeedEnabled is false", () => {
    const settings = aSettings({ dreamFeedEnabled: false });
    const bedtime = aProjectedBedtime({ start: 19 * 60 });
    const postBedtimeBottle = aProjectedBottle({
      id: "b6",
      eventKey: "bottle_6",
      label: "Bottle 6",
      startTime: 22 * 60,
    });
    const out = applyDreamFeedLabel([bedtime, postBedtimeBottle], settings);
    expect(out.find((e) => e.id === "b6")?.label).toBe("Bottle 6");
  });

  it("returns events unchanged when no bedtime is present", () => {
    const settings = aSettings({ dreamFeedEnabled: true });
    const postBedtimeBottle = aProjectedBottle({
      id: "b6",
      eventKey: "bottle_6",
      label: "Bottle 6",
      startTime: 22 * 60,
    });
    const out = applyDreamFeedLabel([postBedtimeBottle], settings);
    expect(out.find((e) => e.id === "b6")?.label).toBe("Bottle 6");
  });

  it("relabels the first projected bottle whose startTime > bedtime.startTime", () => {
    const settings = aSettings({ dreamFeedEnabled: true });
    const bedtime = aProjectedBedtime({ start: 19 * 60 });
    const preBedtime = aProjectedBottle({
      id: "b5",
      eventKey: "bottle_5",
      label: "Bottle 5",
      startTime: 18 * 60,
    });
    const postBedtime1 = aProjectedBottle({
      id: "b6",
      eventKey: "bottle_6",
      label: "Bottle 6",
      startTime: 22 * 60,
    });
    const postBedtime2 = aProjectedBottle({
      id: "b7",
      eventKey: "bottle_7",
      label: "Bottle 7",
      startTime: 25 * 60,
    });
    const out = applyDreamFeedLabel([bedtime, preBedtime, postBedtime1, postBedtime2], settings);
    expect(out.find((e) => e.id === "b5")?.label).toBe("Bottle 5"); // pre-bedtime untouched
    expect(out.find((e) => e.id === "b6")?.label).toBe("Dream Feed"); // first post-bedtime
    expect(out.find((e) => e.id === "b7")?.label).toBe("Bottle 7"); // subsequent untouched
  });

  it("DOES relabel a recorded bottle when it's the first post-bedtime bottle (slot, not forecast)", () => {
    // "Dream Feed" names the slot — a real logged post-bedtime bottle IS the dream feed.
    const settings = aSettings({ dreamFeedEnabled: true });
    const bedtime = aProjectedBedtime({ start: 19 * 60 });
    const recorded = aRecordedBottle({
      id: "b6r",
      eventKey: "bottle_6",
      startTime: 22 * 60,
      label: "Bottle 6",
    });
    const out = applyDreamFeedLabel([bedtime, recorded], settings);
    expect(out.find((e) => e.id === "b6r")?.label).toBe("Dream Feed");
  });

  it("does NOT relabel a bottle whose startTime equals bedtime.startTime (strict >)", () => {
    const settings = aSettings({ dreamFeedEnabled: true });
    const bedtime = aProjectedBedtime({ start: 19 * 60 });
    const atBedtime = aProjectedBottle({
      id: "b-at",
      eventKey: "bottle_5",
      label: "Bottle 5",
      startTime: 19 * 60,
    });
    const out = applyDreamFeedLabel([bedtime, atBedtime], settings);
    expect(out.find((e) => e.id === "b-at")?.label).toBe("Bottle 5");
  });

  it("picks earliest by startTime, not array order", () => {
    // callsites don't guarantee time-sorted events; target is the earliest by startTime.
    const settings = aSettings({ dreamFeedEnabled: true });
    const bedtime = aProjectedBedtime({ start: 19 * 60 });
    const later = aProjectedBottle({
      id: "b-late",
      eventKey: "bottle_7",
      label: "Bottle 7",
      startTime: 25 * 60,
    });
    const earlier = aProjectedBottle({
      id: "b-early",
      eventKey: "bottle_6",
      label: "Bottle 6",
      startTime: 22 * 60,
    });
    // Array order: later first, then earlier.
    const out = applyDreamFeedLabel([bedtime, later, earlier], settings);
    expect(out.find((e) => e.id === "b-early")?.label).toBe("Dream Feed");
    expect(out.find((e) => e.id === "b-late")?.label).toBe("Bottle 7");
  });

  it("preserves event identity for non-relabeled events (===, no needless copies)", () => {
    const settings = aSettings({ dreamFeedEnabled: true });
    const bedtime = aProjectedBedtime({ start: 19 * 60 });
    const bottle = aProjectedBottle({
      id: "b6",
      eventKey: "bottle_6",
      label: "Bottle 6",
      startTime: 22 * 60,
    });
    const input: Event[] = [bedtime, bottle];
    const out = applyDreamFeedLabel(input, settings);
    expect(out[0]).toBe(bedtime); // bedtime untouched (===)
    expect(out[1]).not.toBe(bottle); // relabeled bottle is a fresh copy
    expect(out[1]?.label).toBe("Dream Feed");
  });
});
