import { describe, expect, it } from "vitest";
import { aContext, aProjectedBottle, aProjectedNap, aRecordedNap } from "../__tests__/factories";
import type { Event } from "../schemas";
import { EvaluationError, evaluate, topoSort, type Rule } from "./evaluator";

const noopRule = (id: string, deps?: string[]): Rule => ({
  id,
  description: `noop ${id}`,
  ...(deps ? { dependsOn: deps } : {}),
  matches: () => false,
  produces: (events) => events,
});

describe("topoSort", () => {
  it("orders rules so dependsOn ids precede their dependents", () => {
    const a = noopRule("R.A");
    const b = noopRule("R.B", ["R.A"]);
    const c = noopRule("R.C", ["R.B"]);
    const ordered = topoSort([c, a, b]).map((r) => r.id);
    expect(ordered.indexOf("R.A")).toBeLessThan(ordered.indexOf("R.B"));
    expect(ordered.indexOf("R.B")).toBeLessThan(ordered.indexOf("R.C"));
  });

  it("throws on duplicate rule ids", () => {
    expect(() => topoSort([noopRule("R.A"), noopRule("R.A")])).toThrow(/Duplicate rule id/);
  });

  it("throws on unknown dependency", () => {
    expect(() => topoSort([noopRule("R.A", ["R.MISSING"])])).toThrow(/unknown rule id/);
  });

  it("throws on dependency cycle", () => {
    const a = noopRule("R.A", ["R.B"]);
    const b = noopRule("R.B", ["R.A"]);
    expect(() => topoSort([a, b])).toThrow(/Cycle detected/);
  });
});

describe("evaluate — basics", () => {
  it("returns actuals unchanged when no rules match", () => {
    const recorded = aRecordedNap({ start: 13 * 60, end: 14 * 60 });
    const out = evaluate([], aContext({ actuals: [recorded] }));
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(recorded.id);
  });

  it("sorts output by startTime", () => {
    const earlyRule: Rule = {
      id: "R.early",
      description: "emit a 9am bottle",
      matches: (events) => !events.some((e) => e.type === "bottle"),
      produces: (events) => [...events, aProjectedBottle({ start: 9 * 60 })],
    };
    const out = evaluate(
      [earlyRule],
      aContext({ actuals: [aRecordedNap({ start: 13 * 60, end: 14 * 60 })] }),
    );
    expect(out.map((e) => e.startTime)).toEqual([9 * 60, 13 * 60]);
  });

  it("iterates to a fixed point", () => {
    // Rule emits a single bottle; second pass shouldn't re-add it.
    let invocations = 0;
    const emitOnce: Rule = {
      id: "R.once",
      description: "emit a single bottle",
      matches: (events) => !events.some((e) => e.type === "bottle"),
      produces: (events) => {
        invocations++;
        return [...events, aProjectedBottle({ start: 9 * 60 })];
      },
    };
    evaluate([emitOnce], aContext());
    expect(invocations).toBe(1);
  });

  it("respects dependency ordering across passes", () => {
    const seenA: string[] = [];
    const ruleA: Rule = {
      id: "R.A",
      description: "tag bottles with label A1",
      matches: (events) => events.some((e) => e.type === "bottle" && e.label !== "A1"),
      produces: (events) => events.map((e) => (e.type === "bottle" ? { ...e, label: "A1" } : e)),
    };
    const ruleB: Rule = {
      id: "R.B",
      description: "observe bottle label",
      dependsOn: ["R.A"],
      matches: (events) => events.some((e) => e.type === "bottle"),
      produces: (events) => {
        for (const e of events) {
          if (e.type === "bottle") seenA.push(e.label);
        }
        return events;
      },
    };
    const ruleSeed: Rule = {
      id: "R.seed",
      description: "emit the bottle",
      matches: (events) => !events.some((e) => e.type === "bottle"),
      produces: (events) => [...events, aProjectedBottle({ start: 9 * 60 })],
    };
    evaluate([ruleB, ruleSeed, ruleA], aContext());
    // R.B should always have observed the renamed label, never the original.
    expect(seenA.every((l) => l === "A1")).toBe(true);
  });

  it("throws on non-convergence with a low maxPasses", () => {
    const flipper: Rule = {
      id: "R.flip",
      description: "flip a bottle's label every pass",
      matches: () => true,
      produces: (events) => {
        if (events.length === 0) return [aProjectedBottle({ start: 9 * 60 })];
        return events.map((e) =>
          e.type === "bottle" ? { ...e, label: e.label === "A" ? "B" : "A" } : e,
        );
      },
    };
    expect(() => evaluate([flipper], aContext(), { maxPasses: 3 })).toThrow(EvaluationError);
  });

  it("surfaces assertAfter failures with the rule id", () => {
    const seed: Rule = {
      id: "R.seed",
      description: "emit a nap",
      matches: (events) => events.length === 0,
      produces: () => [aProjectedNap({ start: 9 * 60, end: 10 * 60 })],
    };
    const assertion: Rule = {
      id: "R.assert",
      description: "asserts naps end at 9:30 (will fail)",
      dependsOn: ["R.seed"],
      matches: (events) => events.some((e) => e.type === "nap"),
      produces: (events) => events,
      assertAfter: (events) => {
        const nap = events.find((e) => e.type === "nap");
        if (nap?.endTime !== 9 * 60 + 30) {
          return `nap endTime expected 9:30 got ${nap?.endTime}`;
        }
        return null;
      },
    };
    // assertAfter only runs when produces returns a *changed* event set —
    // so we set up a rule that mutates and then asserts.
    const mutator: Rule = {
      id: "R.mutator",
      description: "extend nap label",
      dependsOn: ["R.seed"],
      matches: (events) => events.some((e) => e.type === "nap" && e.label === "nap_1"),
      produces: (events) => events.map((e) => (e.type === "nap" ? { ...e, label: "Nap 1" } : e)),
      assertAfter: (events) => {
        const nap = events.find((e) => e.type === "nap");
        if (nap?.endTime !== 9 * 60 + 30) {
          return `nap endTime expected 9:30 got ${nap?.endTime}`;
        }
        return null;
      },
    };
    void assertion; // unused; kept to demonstrate rule shape
    expect(() => evaluate([seed, mutator], aContext())).toThrow(/R.mutator/);
  });
});

describe("evaluate — reality-wins guard", () => {
  it("throws if a rule removes a recorded event", () => {
    const recorded = aRecordedNap({ start: 13 * 60, end: 14 * 60 });
    const naughty: Rule = {
      id: "R.naughty.remove",
      description: "tries to drop the recorded nap",
      matches: () => true,
      produces: (events) => events.filter((e) => e.id !== recorded.id),
    };
    expect(() => evaluate([naughty], aContext({ actuals: [recorded] }))).toThrow(
      /R\.naughty\.remove/,
    );
  });

  it("throws if a rule mutates a recorded event's startTime", () => {
    const recorded = aRecordedNap({ start: 13 * 60, end: 14 * 60 });
    const naughty: Rule = {
      id: "R.naughty.shift",
      description: "shifts recorded nap by 5 minutes",
      matches: () => true,
      produces: (events) =>
        events.map((e: Event) => (e.id === recorded.id ? { ...e, startTime: e.startTime + 5 } : e)),
    };
    expect(() => evaluate([naughty], aContext({ actuals: [recorded] }))).toThrow(
      /mutated recorded event/,
    );
  });

  it("throws if a rule downgrades a recorded event back to projected", () => {
    const recorded = aRecordedNap({ start: 13 * 60, end: 14 * 60 });
    const naughty: Rule = {
      id: "R.naughty.downgrade",
      description: "tries to mark recorded as projected",
      matches: () => true,
      produces: (events) =>
        events.map((e: Event) =>
          e.id === recorded.id ? { ...e, lifecycle: { state: "projected" } } : e,
        ),
    };
    expect(() => evaluate([naughty], aContext({ actuals: [recorded] }))).toThrow(
      /downgraded recorded event/,
    );
  });

  it("allows display-only mutations on recorded events (label, hasPutdown)", () => {
    const recorded = aRecordedNap({
      start: 13 * 60,
      end: 14 * 60,
      label: "nap_1",
    });
    const benign: Rule = {
      id: "R.benign.label",
      description: "rename label for display",
      matches: (events) => events.some((e) => e.id === recorded.id && e.label === "nap_1"),
      produces: (events) =>
        events.map((e: Event) => (e.id === recorded.id ? { ...e, label: "Nap 1" } : e)),
    };
    const out = evaluate([benign], aContext({ actuals: [recorded] }));
    expect(out[0]!.label).toBe("Nap 1");
  });
});
