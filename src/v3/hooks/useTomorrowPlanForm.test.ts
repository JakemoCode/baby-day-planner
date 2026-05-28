import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTomorrowPlanForm } from "./useTomorrowPlanForm";
import { NO_OWNER, type Event, type TomorrowPlan } from "../schemas";

const DWT = 7 * 60; // default wake time, 7:00

const anExtra = (overrides: Partial<Event> = {}): Event => ({
  id: "extra-1",
  dayId: "tomorrow-2026-06-01",
  eventKey: "extra-1",
  type: "extra",
  kind: "instant",
  startTime: 13 * 60,
  label: "Pediatrician",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

const aPlan = (overrides: Partial<TomorrowPlan> = {}): TomorrowPlan => ({
  childId: "child-1",
  date: "2026-06-01",
  status: "draft",
  ownerOverrides: {},
  extras: [],
  ...overrides,
});

function setup(plan: TomorrowPlan | null, loading: boolean) {
  return renderHook(
    ({ p, l }: { p: TomorrowPlan | null; l: boolean }) => useTomorrowPlanForm(p, l, DWT),
    {
      initialProps: { p: plan, l: loading },
    },
  );
}

describe("useTomorrowPlanForm", () => {
  it("starts at defaults and hydrates (no plan) once loading finishes", () => {
    const { result } = setup(null, false);
    expect(result.current.wakeTime).toBe(DWT);
    expect(result.current.templateId).toBeUndefined();
    expect(result.current.extras).toEqual([]);
    expect(result.current.ownerOverrides).toEqual({});
    expect(result.current.hasEdits).toBe(false);
    expect(result.current.hydrated).toBe(true);
  });

  it("does not hydrate while loading (hydrated stays false, fields stay default)", () => {
    const { result } = setup(aPlan({ wakeTime: 6 * 60 }), true);
    expect(result.current.hydrated).toBe(false);
    expect(result.current.wakeTime).toBe(DWT);
  });

  it("hydrates fields from the loaded plan once loading finishes", () => {
    const plan = aPlan({
      wakeTime: 6 * 60 + 30,
      startTemplateId: "tpl-sat",
      extras: [anExtra()],
      ownerOverrides: { nap_1: { slot: "parent1" } },
    });
    const { result } = setup(plan, false);
    expect(result.current.wakeTime).toBe(6 * 60 + 30);
    expect(result.current.templateId).toBe("tpl-sat");
    expect(result.current.extras).toEqual([anExtra()]);
    expect(result.current.ownerOverrides).toEqual({ nap_1: { slot: "parent1" } });
    expect(result.current.hasEdits).toBe(true);
  });

  it("hydration is one-shot — a later plan snapshot does not clobber a user edit", () => {
    const { result, rerender } = setup(aPlan({ wakeTime: 6 * 60 }), false);
    expect(result.current.wakeTime).toBe(6 * 60);

    act(() => result.current.setWakeTime(8 * 60)); // user edits
    expect(result.current.wakeTime).toBe(8 * 60);

    // Snapshot from another tab — already hydrated, so user's edit is kept.
    rerender({ p: aPlan({ wakeTime: 5 * 60 }), l: false });
    expect(result.current.wakeTime).toBe(8 * 60);
  });

  it("upsertExtra adds then updates by id; removeExtra drops by id", () => {
    const { result } = setup(null, false);
    act(() => result.current.upsertExtra(anExtra({ id: "e1", label: "Walk" })));
    expect(result.current.extras).toHaveLength(1);
    expect(result.current.extras[0]?.label).toBe("Walk");

    act(() => result.current.upsertExtra(anExtra({ id: "e1", label: "Long walk" })));
    expect(result.current.extras.length).toBe(1); // updated in place
    expect(result.current.extras[0]?.label).toBe("Long walk");

    act(() => result.current.upsertExtra(anExtra({ id: "e2", label: "Visit" })));
    expect(result.current.extras.length).toBe(2);

    act(() => result.current.removeExtra("e1"));
    expect(result.current.extras.map((e) => e.id)).toEqual(["e2"]);
  });

  it("setOwnerOverride merges into the map (does not replace)", () => {
    const { result } = setup(null, false);
    act(() => result.current.setOwnerOverride("nap_1", { slot: "parent1" }));
    act(() => result.current.setOwnerOverride("nap_2", null));
    expect(result.current.ownerOverrides).toEqual({ nap_1: { slot: "parent1" }, nap_2: null });
  });

  it("hasEdits flips true on any divergence from defaults", () => {
    const { result } = setup(null, false);
    expect(result.current.hasEdits).toBe(false);
    act(() => result.current.setTemplateId("tpl-x"));
    expect(result.current.hasEdits).toBe(true);
  });

  it("reset() blanks the form to defaults and stays hydrated", () => {
    const { result } = setup(aPlan({ wakeTime: 6 * 60 }), false);
    act(() => result.current.setTemplateId("tpl-x"));
    expect(result.current.hasEdits).toBe(true);

    act(() => result.current.reset());
    expect(result.current.wakeTime).toBe(DWT);
    expect(result.current.templateId).toBeUndefined();
    expect(result.current.hasEdits).toBe(false);
    expect(result.current.hydrated).toBe(true);
  });

  // reset() must NOT re-arm hydration — stale subscription snapshot would re-hydrate and resurrect the doc.
  it("reset() does not re-hydrate from a still-present (stale) plan", () => {
    const { result, rerender } = setup(aPlan({ wakeTime: 6 * 60 }), false);
    act(() => result.current.setWakeTime(8 * 60));

    act(() => result.current.reset());
    expect(result.current.wakeTime).toBe(DWT); // blanked, not refilled to 6*60

    // Stale snapshot must be ignored.
    rerender({ p: aPlan({ wakeTime: 6 * 60 }), l: false });
    expect(result.current.wakeTime).toBe(DWT);
    expect(result.current.hasEdits).toBe(false);
  });
});
