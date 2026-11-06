/**
 * Seam test (R3.11, DOMAIN.md §3): at 13:00 the engine has auto-promoted the
 * 12:30 nap_2 to "recorded", so the dashboard reads it as in progress and counts
 * it in today's nap total. The household taps it and skips it. Wires the rendered
 * event through the drawer policy and the suppression matcher, then the real
 * projectDay and renderProjection, into the dashboard's selectors.
 */

import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase/firestore";
import { projectDay } from "../engine/projectDay";
import { ALL_RULES } from "../engine/rules";
import { renderProjection } from "../ui/renderProjection";
import { drawerDestructiveAction } from "../components/shared/drawerDeletePolicy";
import { useDayDrawerSuppressions } from "../hooks/useDayDrawerSuppressions";
import { napTotals } from "../components/Dashboard/dashboardStats";
import { nextSleep } from "../selectors";
import { isInProgress } from "../lib/effectiveEnd";
import { isRenderSynthetic } from "../lib/syntheticEvents";
import { aDay, aSettings } from "./factories";
import type { Event } from "../schemas";

// wake 07:00, WWs [120,150,180], 60-min naps: nap_1 09:00, nap_2 12:30, nap_3 16:30.
const NOW = 13 * 60;
const settings = aSettings({ wakeWindowsMinutes: [120, 150, 180], defaultNapLengthMinutes: 60 });

function dashboardView(suppressedNapKeys: string[]): Event[] {
  const day = aDay({ wakeTime: 7 * 60, suppressedNapKeys });
  const events = projectDay({ day, settings, actuals: [], nowMinutes: NOW }, { rules: ALL_RULES });
  return renderProjection(events, settings, NOW);
}

const inProgressNap = (view: Event[]) =>
  view.find((e) => e.type === "nap" && !isRenderSynthetic(e) && isInProgress(e, settings, NOW));

describe("seam: skip an auto-promoted nap → dashboard moves on to the next real sleep", () => {
  it("before the skip, nap_2 reads as in progress and counts toward today's naps", () => {
    const view = dashboardView([]);
    expect(inProgressNap(view)?.eventKey).toBe("nap_2");
    expect(napTotals(view, NOW)).toEqual({ count: 2, totalMinutes: 90 });
  });

  it("the tapped nap offers Delete and routes to the nap suppression keyed by its slot", () => {
    const nap2 = dashboardView([]).find((e) => e.eventKey === "nap_2" && !isRenderSynthetic(e))!;
    expect(drawerDestructiveAction(nap2, { mode: "edit", hasOnDelete: true })).toBe("delete");
    const matching = useDayDrawerSuppressions({} as Firestore, "child_test", "day_test").filter(
      (s) => s.matches(nap2),
    );
    expect(matching).toHaveLength(1);
  });

  it("after the skip, nothing renders for nap_2, totals drop it and the next sleep is nap_3", () => {
    const view = dashboardView(["nap_2"]);
    expect(view.filter((e) => e.eventKey === "nap_2")).toEqual([]);
    expect(inProgressNap(view)).toBeUndefined();
    expect(napTotals(view, NOW)).toEqual({ count: 1, totalMinutes: 60 });
    const next = nextSleep(view, NOW);
    expect([next?.eventKey, next?.startTime]).toEqual(["nap_3", 16 * 60 + 30]);
  });
});
