/**
 * Engine-level property tests.
 *
 * These properties express invariants from REQUIREMENTS.md §0 and the
 * Cross-Cutting Concerns. They should hold for any rule set (including the
 * empty default) — domain-specific properties live alongside their rule files.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isRecorded } from "../schemas";
import { projectDay } from "../engine/projectDay";
import { arbProjectInput } from "./arbitraries";

const NUM_RUNS = 200; // bumped per-property when the rule set grows

describe("§0 Reality wins", () => {
  it("every recorded actual appears in the output unchanged", () => {
    fc.assert(
      fc.property(arbProjectInput, (input) => {
        const out = projectDay(input);
        const outById = new Map(out.map((e) => [e.id, e]));
        for (const actual of input.actuals.filter((e) => isRecorded(e.lifecycle))) {
          const echoed = outById.get(actual.id);
          expect(echoed).toBeDefined();
          expect(echoed!.startTime).toBe(actual.startTime);
          expect(echoed!.endTime).toBe(actual.endTime);
          expect(echoed!.amountOz).toBe(actual.amountOz);
          expect(echoed!.lifecycle).toEqual(actual.lifecycle);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("CC2 Idempotency", () => {
  it("re-running projectDay on the same input produces identical output", () => {
    fc.assert(
      fc.property(arbProjectInput, (input) => {
        const a = projectDay(input);
        const b = projectDay(input);
        expect(b).toEqual(a);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("Output ordering", () => {
  it("output is sorted by startTime ascending", () => {
    fc.assert(
      fc.property(arbProjectInput, (input) => {
        const out = projectDay(input);
        for (let i = 1; i < out.length; i++) {
          expect(out[i]!.startTime).toBeGreaterThanOrEqual(out[i - 1]!.startTime);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("R5.6 — projected bottles are never inside any nap region", () => {
  it("no PROJECTED bottle's startTime falls strictly inside any nap interval", () => {
    fc.assert(
      fc.property(arbProjectInput, (input) => {
        const out = projectDay(input);
        const naps = out.filter((e) => e.type === "nap" && e.endTime !== undefined);
        const projectedBottles = out.filter(
          (e) => e.type === "bottle" && e.lifecycle.state === "projected",
        );
        for (const bottle of projectedBottles) {
          for (const nap of naps) {
            const inside = bottle.startTime > nap.startTime && bottle.startTime < nap.endTime!;
            expect(inside).toBe(false);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
