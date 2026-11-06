/**
 * R3.12 seam: a FAB nap set a few minutes ahead takes the first projected slot that ends
 * after its start, so naps sort in clock order and the wake windows follow the clock.
 */

import { describe, expect, it } from "vitest";
import { projectDay } from "../engine/projectDay";
import { ALL_RULES } from "../engine/rules";
import { isRenderSynthetic } from "../lib/syntheticEvents";
import { aDay, aRecordedNap, aSettings } from "./factories";
import { withRealizeTag } from "../lib/realizeForecast";
import { buildCreateTemplate } from "../components/shared/createEventTemplate";
import { formToEvent } from "../components/shared/formToEvent";

// wake 07:00, WWs [120,150,180], 60-min naps: nap_1 09:00, nap_2 12:30, nap_3 16:30.
const NOW = 14 * 60;
const settings = aSettings({ wakeWindowsMinutes: [120, 150, 180], defaultNapLengthMinutes: 60 });

describe("R3.12 seam: a FAB nap set a few minutes ahead", () => {
  it("lands in clock order and its wake windows follow the clock", () => {
    const day = aDay({ wakeTime: 7 * 60 });
    const nap1 = aRecordedNap({
      id: "recorded_nap_1",
      eventKey: "nap_1",
      start: 9 * 60,
      end: 10 * 60,
    });
    const before = projectDay(
      { day, settings, actuals: [nap1], nowMinutes: NOW },
      { rules: ALL_RULES },
    );
    const template = buildCreateTemplate({
      type: "nap",
      dayId: day.id,
      actuals: [nap1],
      settings,
      nowMinutes: NOW,
      projected: before,
    });
    // Parent opens the FAB at 14:00 and sets the start to 14:30 ("going down in half an hour").
    const built = formToEvent(
      {
        startTime: 14 * 60 + 30,
        endTime: 15 * 60 + 15,
        amountOz: undefined,
        owner: undefined,
        label: template.label,
      },
      template,
      NOW,
      "create",
    );
    const saved = withRealizeTag({
      mode: "create",
      source: template,
      saved: built,
      projection: before,
      nowMinutes: NOW,
      intervalMinutes: 180,
    });

    const after = projectDay(
      { day, settings, actuals: [nap1, saved], nowMinutes: NOW },
      { rules: ALL_RULES },
    );
    const naps = after
      .filter((e) => e.type === "nap" && !isRenderSynthetic(e))
      .sort((a, b) => a.startTime - b.startTime);
    const byKey = [...naps].sort(
      (a, b) => Number(a.eventKey.replace("nap_", "")) - Number(b.eventKey.replace("nap_", "")),
    );
    expect(naps.map((e) => e.eventKey)).toEqual(byKey.map((e) => e.eventKey));
  });
});
