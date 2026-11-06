/**
 * R3.12 seam: a FAB nap set ahead to start a little after the next projected nap's start
 * is that nap, so the day shows one nap there, not the projected slot and the FAB nap both.
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
const NOW = 10 * 60 + 30;
const settings = aSettings({ wakeWindowsMinutes: [120, 150, 180], defaultNapLengthMinutes: 60 });

describe("R3.12 seam: a FAB nap set ahead to start inside the next projected nap", () => {
  it("is that nap, so no projected nap overlaps it", () => {
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
    // At 10:30 the forecast says Nap 2 at 12:30; the parent logs it for 12:45.
    const built = formToEvent(
      {
        startTime: 12 * 60 + 45,
        endTime: 13 * 60 + 30,
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
    const overlapping = after.filter(
      (e) =>
        e.type === "nap" &&
        !isRenderSynthetic(e) &&
        e.id !== saved.id &&
        e.startTime < saved.endTime! &&
        (e.endTime ?? e.startTime) > saved.startTime,
    );
    expect(overlapping.map((e) => `${e.id} ${e.startTime}-${e.endTime}`)).toEqual([]);
  });
});
