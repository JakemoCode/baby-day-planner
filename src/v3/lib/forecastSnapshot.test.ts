import { describe, expect, it } from "vitest";
import { forecastSnapshotDocs } from "./forecastSnapshot";
import { aProjectedBottle, aRecordedBottle, aProjectedNap } from "../__tests__/factories";
import { DREAM_FEED_EVENT_KEY } from "./eventConventions";
import type { Event } from "../schemas";

describe("forecastSnapshotDocs — freeze the closing day's forecast bottles at archival (§F66 Slice 4)", () => {
  const closingDayId = "day-closing";

  it("converts engine-emitted (proj_) bottles into recorded docs under the closing day", () => {
    const projected = aProjectedBottle({
      id: "proj_bottle_t430",
      eventKey: "bottle_1",
      start: 430,
    });
    const [doc] = forecastSnapshotDocs([projected], closingDayId);
    expect(doc!.id).toBe("recorded_bottle_t430"); // deterministic recorded id (recordedIdForEvent)
    expect(doc!.dayId).toBe(closingDayId);
    expect(doc!.lifecycle).toEqual({ state: "recorded", annotatedAt: 430 });
    expect(doc!.type).toBe("bottle");
  });

  it("does NOT re-snapshot already-persisted recorded bottles", () => {
    const persisted = aRecordedBottle({
      id: "recorded_bottle_t600",
      eventKey: "bottle_2",
      start: 600,
    });
    expect(forecastSnapshotDocs([persisted], closingDayId)).toEqual([]);
  });

  it("ignores non-bottles (naps/etc.) and the dream-feed", () => {
    const nap = aProjectedNap({ id: "proj_nap_1", eventKey: "nap_1", start: 540, end: 600 });
    const dream: Event = aProjectedBottle({
      id: `proj_${DREAM_FEED_EVENT_KEY}`,
      eventKey: DREAM_FEED_EVENT_KEY,
      start: 1320,
    });
    expect(forecastSnapshotDocs([nap, dream], closingDayId)).toEqual([]);
  });

  it("freezes a bottle the engine already now-cross-promoted (recorded lifecycle but still proj_ id)", () => {
    const promoted = aProjectedBottle({
      id: "proj_bottle_t250",
      eventKey: "bottle_1",
      start: 250,
      lifecycle: { state: "recorded", annotatedAt: 250 },
    });
    const [doc] = forecastSnapshotDocs([promoted], closingDayId);
    expect(doc!.id).toBe("recorded_bottle_t250"); // proj_ id ⇒ not yet persisted ⇒ freeze it
  });
});
