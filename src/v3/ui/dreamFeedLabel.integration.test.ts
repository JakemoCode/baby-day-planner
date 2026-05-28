/**
 * Integration: full projectDay + applyDreamFeedLabel path.
 *
 * Original context (pre-PR-6): Jake reported on 2026-05-13 that his
 * click-test showed a "Bottle 6" past bedtime instead of "Dream Feed".
 * In the pre-PR-6 engine, the rhythm cascade always capped at bedtime,
 * so dream-feed was render-only and had no projected bottle to relabel.
 *
 * Post-PR-6 (§F66): the engine emits a projected dream-feed bottle at
 * `settings.dreamFeedTime` via rule R5.5. The label-pass then either
 * leaves it alone (R5.5 already labels it "Dream Feed") or relabels a
 * separate post-bedtime bottle that happened to slip through, for
 * resilience.
 */

import { describe, expect, it } from "vitest";
import { aContext, aDay, aSettings } from "../__tests__/factories";
import { projectDay } from "../engine/projectDay";
import { ALL_RULES } from "../engine/rules";
import { applyDreamFeedLabel } from "./dreamFeedLabel";

describe("applyDreamFeedLabel — end-to-end with projectDay", () => {
  it("cold-start with 6 bottles + bedtime at 22:00: rhythm cascade caps at bedtime; R5.5 emits dream-feed at 23:00 with the Dream Feed label", () => {
    // WW [120, 150, 180, 180, 30] + napLen 60 + threshold 22:30 →
    // nap_5 start 22:00, endTime=23:00 > 22:30 → ADR-0002: drop.
    // §F66 fast-follow B8: bedtime = max(earliestBedtime=18:00,
    // wwStart+WW=21:30+30=22:00) = 22:00. Full WW before bedtime.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        dreamFeedEnabled: true,
        dreamFeedTime: 23 * 60,
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

    // Rhythm cascade caps at bedtime (excluding dream-feed): all
    // non-dream projected bottles are ≤ bedtime.startTime.
    const rhythmProjected = events.filter(
      (e) =>
        e.type === "bottle" && e.lifecycle.state === "projected" && e.eventKey !== "bottle_dream",
    );
    for (const b of rhythmProjected) {
      expect(b.startTime).toBeLessThanOrEqual(22 * 60);
    }

    // Dream-feed slot is emitted at dreamFeedTime (post-bedtime) with
    // the "Dream Feed" label baked in by R5.5. The label pass is a
    // no-op on this output.
    const dream = events.find((e) => e.type === "bottle" && e.eventKey === "bottle_dream");
    expect(dream?.startTime).toBe(23 * 60);
    expect(dream?.label).toBe("Dream Feed");
    expect(dream?.lifecycle.state).toBe("projected");

    const labeled = applyDreamFeedLabel(events, ctx.settings);
    expect(labeled.find((e) => e.eventKey === "bottle_dream")?.label).toBe("Dream Feed");
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
