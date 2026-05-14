/**
 * Integration: full projectDay + applyDreamFeedLabel path.
 *
 * Context: Jake reported on 2026-05-13 that his click-test showed
 * a "Bottle 6" past bedtime instead of "Dream Feed". This test
 * exists to characterize what the engine actually emits in
 * configurations near his and to prove the labeler fires when the
 * preconditions are met.
 *
 * Finding: in cold-start (no anchors), the bottle cascade CAPS at
 * bedtime.startTime — so projected bottles are NEVER past bedtime
 * in the post-PR-#138 engine. The label has nothing to fire on.
 *
 * The screenshot scenario therefore implies either:
 *   - stale persisted data (a previously-projected bottle written
 *     to Firestore by a now-removed code path), OR
 *   - a recorded/overridden bottle past bedtime (reality wins;
 *     these are intentionally NOT relabeled — see unit tests), OR
 *   - dreamFeedEnabled didn't actually persist.
 */

import { describe, expect, it } from "vitest";
import { aContext, aDay, aSettings } from "../__tests__/factories";
import { projectDay } from "../engine/projectDay";
import { ALL_RULES } from "../engine/rules";
import { applyDreamFeedLabel } from "./dreamFeedLabel";

describe("applyDreamFeedLabel — end-to-end with projectDay", () => {
  it("cold-start with 6 bottles + bedtime at 22:00: cascade caps at bedtime, no relabel happens", () => {
    // WW [120, 150, 180, 180, 30] + napLen 60 + threshold 22:30 →
    // bedtime substituted at 22:00 (nap_5 start 22:00, 22:00+60 > 22:30).
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        dreamFeedEnabled: true,
        bedtimeThreshold: 22 * 60 + 30,
        wakeWindowsMinutes: [120, 150, 180, 180, 30],
        defaultNapLengthMinutes: 60,
        defaultBottleAmountOz: 5,
        defaultBottleIntervalMinutes: 180,
        bottleChain: { bottlesPerDay: 6, bufferAfterWakeMinutes: 10 },
        minBottleIntervalMinutes: 90,
      }),
      actuals: [],
    });

    const events = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL_RULES },
    );

    const bedtime = events.find((e) => e.type === "bedtime");
    expect(bedtime?.startTime).toBe(22 * 60);

    // Engine output: all projected bottles are ≤ bedtime.startTime.
    const projectedBottles = events.filter(
      (e) => e.type === "bottle" && e.lifecycle.state === "projected",
    );
    for (const b of projectedBottles) {
      expect(b.startTime).toBeLessThanOrEqual(22 * 60);
    }

    // Therefore the labeler has no past-bedtime bottle to relabel.
    const labeled = applyDreamFeedLabel(events, ctx.settings);
    expect(labeled.find((e) => e.label === "Dream Feed")).toBeUndefined();
  });

  it("when a projected bottle DOES land past bedtime, the labeler fires end-to-end", () => {
    // Synthetic: hand-construct an events array that has a projected
    // bottle past bedtime. This represents the rendered-side
    // contract — once such an event exists (from any path), the
    // label should apply.
    const ctx = aContext({
      settings: aSettings({ dreamFeedEnabled: true }),
    });
    const events = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL_RULES },
    );

    // Manually inject a projected bottle past the projected bedtime.
    const bedtime = events.find((e) => e.type === "bedtime");
    if (!bedtime) throw new Error("test setup: expected projected bedtime");
    const synthetic = {
      ...events.filter((e) => e.type === "bottle")[0]!,
      id: "synth_b_post_bedtime",
      eventKey: "bottle_post",
      startTime: bedtime.startTime + 60,
      label: "Bottle 99",
    };
    const withSynthetic = [...events, synthetic];

    const labeled = applyDreamFeedLabel(withSynthetic, ctx.settings);
    expect(labeled.find((e) => e.id === "synth_b_post_bedtime")?.label).toBe("Dream Feed");
  });
});
