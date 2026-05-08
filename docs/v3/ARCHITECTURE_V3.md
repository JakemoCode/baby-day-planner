# V3 Architecture Proposal

> Status: **PROPOSAL** — pending Jake review. Decisions marked `[OPEN]`
> need ratification before Phase 1 begins.

> Companion docs: `REQUIREMENTS.md` (what), `EDGE_CASES.md` (regression
> seed), `OUT_OF_SCOPE.md` (what we're NOT doing).

---

## TL;DR

V3 keeps the V2 stack (Next.js, Firestore, TypeScript) but reshapes
the engine from an imperative pipeline of step-functions into a
**declarative rule system + a small term-rewriting evaluator**. Same UI
surface, same data store, dramatically simpler engine.

Key bets:
1. **Rules are data, not code paths.** A rule = `{ matches: predicate,
   produces: effect }`. The evaluator iterates to a fixed point. Order
   is derived from declared dependencies, not from how steps were
   wired in `project.ts`.
2. **Lifecycle as state machine.** `Event.recorded` (V2's bandaid)
   becomes a derived predicate over an explicit lifecycle field. State
   transitions enumerated; impossible states unrepresentable.
3. **Property-based testing replaces example-based.** `EDGE_CASES.md`
   becomes seeds; the property tests run thousands of generated
   scenarios per CI run.
4. **Strangler migration.** V2 keeps running for daily use through
   the entire V3 build. Feature flag, side-by-side comparison,
   incremental cutover.

Everything else (UI components, Firestore schema with additive
extensions, Settings shape) stays roughly the same.

---

## Why a rules engine — what V2 actually struggled with

A pattern from this build session:

| Bug | Root cause | What it had in common |
|---|---|---|
| Wake window time clobbered | `applyWakeWindowOverrides` ran AFTER cascade | Implicit ordering |
| Putdown vanished on owner edit | `addPutdownEvents` filtered on stale source | Conflated state |
| Bottle 4 → 3 → 5 | `projectBottleChain` anchored on wrong field | Missing invariant |
| Bedtime instant ↔ block | `kind` decision made downstream of `endTime` | Coupling |
| Dream feed owner lost | `addDreamFeed` ignored `actuals` | Missing user-override case |

**Three things kept recurring**:
- Step ordering bugs (Step A clobbering Step B's output).
- Conflated state (one field carrying multiple meanings: `source`
  AND `status` AND `recorded` AND `kind` to express ~3 distinct
  intents).
- Missing invariants (no compiler error when an event was emitted
  with mismatched shape).

A rules engine, even a tiny one, attacks all three:
- **Ordering**: rules declare dependencies; the evaluator picks order.
- **State**: rules pattern-match on shape; you can't run a rule on the
  wrong shape.
- **Invariants**: rules can be invariant-checks (`assert: predicate`)
  that fail loudly during evaluation if violated.

We're not building Datalog. We're building 200 lines of TypeScript
that do for V2's `project.ts` what Redux did for jQuery state mgmt.

---

## §1 Data Model

### 1.1 Event shape (V3)

```ts
type Event = {
  id: string;                     // Firestore doc id (collision-safe)
  dayId: string;                  // parent day
  eventKey: string;               // semantic slot: "nap_2", "bedtime"

  // What kind of event
  type: EventType;                // 'nap' | 'wake_window' | ... (same as V2)
  kind: EventKind;                // 'block' | 'instant' (derived from type+endTime)

  // Time
  startTime: TimeMin;             // minutes since midnight (24+ for cross-day)
  endTime?: TimeMin;              // present iff kind === 'block'

  // Domain attributes
  label: string;
  owner?: Owner;
  amountOz?: number;              // bottle / dream_feed only

  // Lifecycle (replaces V2's source + status + recorded triplet)
  lifecycle: Lifecycle;
};

type Lifecycle =
  | { state: 'projected' }                          // engine-emitted
  | { state: 'started';   committedAt: TimeMin }    // dashboard Start, no End yet
  | { state: 'completed'; committedAt: TimeMin }    // Start+End, FAB-create, time-edit
  | { state: 'overridden'; annotatedAt: TimeMin };  // owner-only annotation

type EventKind = 'block' | 'instant';

// V3 owner system: configurable slots, not hard-coded names. See R1.7.
type OwnerSlot = 'parent1' | 'parent2';
type OwnerRef =
  | { slot: OwnerSlot }
  | { slot: 'other'; otherId: string };

type TimeMin = number; // 0..1440+ (cross-day)
```

**What changed from V2**:
- `source` (provenance) and `status` (stage) collapsed into one
  discriminated union: `lifecycle`. Each state carries the data it
  needs (e.g. `committedAt` for recordings).
- `recorded` becomes a predicate: `recorded === lifecycle.state ===
  'started' || 'completed'`. Not stored.
- `startTime`/`endTime` are integer minutes, not strings. String
  formatting happens at the UI boundary only.
- `Event.kind` stays explicit (was added in V2 phase 1; keep it for
  layout dispatch — it's still cheap).

**Migration**:
- Firestore converter on read: V2 docs (with `source`/`status`/
  `recorded`/string times) → V3 shape via `migrateEventV2toV3`.
- Firestore converter on write: V3 docs always written in V3 shape.
- Old docs are progressively rewritten as users edit them. After ~6
  weeks of use, the V2 fallback can be dropped.

### 1.2 Day shape

Adds:
- `suppressedRecurringIds: string[]` — per-day skip of recurring
  projections (see R11.6).

### 1.3 OwnershipTemplate shape

```ts
OwnershipTemplate = {
  id: string;
  displayName: string;            // user-named (R13.1)
  napOwners: OwnerRef[];
  wakeWindowOwners: OwnerRef[];   // template-only; no fallback to nap (R12.3)
  bottleOwners?: OwnerRef[];
  bedtimeOwner?: OwnerRef;        // no lastNapOwner fallback (R12.5)
};
```

### 1.4 Settings shape

V3 additions on top of V2:
```ts
Settings.defaultWakeTime: TimeMin;            // R7.1 — drives bedtime endTime
Settings.bottleChain: {
  maxBottlesPerDay: number;                   // R5.8/R5.12
  latestProjectedStart: TimeMin;
};
Settings.pumpOwnerSlot: OwnerSlot;            // R12.8 — pump default owner
Settings.dailyRecurring: Array<{              // R11 — replaces cookDinner
  id: string;
  label: string;
  time: TimeMin;
  durationMinutes?: number;
  defaultOwnerSlot?: OwnerSlot;
  enabled: boolean;
}>;
Settings.owners: {                            // R1.7 — configurable owner slots
  parent1: { displayName: string; color: ColorToken };
  parent2: { displayName: string; color: ColorToken };
  other: Array<{ id: string; displayName: string; color: ColorToken }>;
};
```

V2 `Settings.cookDinner` migrated to a single `dailyRecurring` entry
on read; the field is dropped going forward.

---

## §2 The Rules Engine

### 2.1 Rule shape

```ts
type Rule = {
  id: string;                              // 'R3.5' from REQUIREMENTS.md
  description: string;                     // human-readable

  // What this rule needs to be true before it can run
  dependsOn?: string[];                    // other rule ids

  // Pattern match on the current event set + context
  matches: (events: Event[], ctx: Context) => boolean;

  // Produce a transformation of the event set
  produces: (events: Event[], ctx: Context) => Event[];

  // Optional invariant assertion — if this returns false,
  // evaluation aborts with a diagnostic
  assertAfter?: (events: Event[], ctx: Context) => string | null;
};

type Context = {
  day: Day;
  settings: Settings;
  template?: OwnershipTemplate;
  actuals: Event[];                        // user-recorded docs from Firestore
  nowMinutes: TimeMin;
};
```

### 2.2 Evaluator

```ts
function evaluate(rules: Rule[], ctx: Context): Event[] {
  const ordered = topoSort(rules);          // by dependsOn
  let events: Event[] = [];
  let pass = 0;
  const MAX_PASSES = 16;

  while (pass++ < MAX_PASSES) {
    let changed = false;
    for (const rule of ordered) {
      if (!rule.matches(events, ctx)) continue;
      const next = rule.produces(events, ctx);
      if (!isEqual(events, next)) {         // structural deep-equal
        events = next;
        changed = true;
        if (rule.assertAfter) {
          const err = rule.assertAfter(events, ctx);
          if (err) throw new EvaluationError(rule.id, err, events);
        }
      }
    }
    if (!changed) break;
  }
  if (pass >= MAX_PASSES) {
    throw new EvaluationError('CONVERGENCE', 'rules did not stabilize');
  }
  return events.sort((a, b) => a.startTime - b.startTime);
}
```

**Properties**:
- **Deterministic**: same input → same output (CC2).
- **Bounded**: `MAX_PASSES = 16` is a safety net; in practice the V2
  pipeline never needed more than 8.
- **Loud failure**: if `assertAfter` violations or non-convergence,
  throw with the rule id and event state. Stack trace points at the
  failing invariant, not random downstream code.
- **Order from data**: `dependsOn` declares "rule X must observe
  rule Y's output." `topoSort` derives the run order. Adding a new
  rule = adding a row, not editing 8 files.

### 2.3 Sample rules

```ts
// R3.1: project the initial nap chain
const RuleProjectNapChain: Rule = {
  id: 'R3.1',
  description: 'Project the day\'s base nap chain from settings.wakeWindowsMinutes',
  matches: (events, ctx) =>
    !!ctx.day.wakeTime && events.length === 0,
  produces: (events, ctx) => projectBaseNapChain(ctx.day, ctx.settings),
};

// R3.5: clamp WW to actual nap start
const RuleClampWWToNap: Rule = {
  id: 'R3.5',
  description: 'Wake window N must end exactly at nap N\'s start',
  dependsOn: ['R3.1'],
  matches: (events) =>
    events.some(e =>
      e.type === 'wake_window' &&
      events.find(n => isCorrespondingNap(e, n) && n.startTime !== e.endTime)
    ),
  produces: (events) => clampAllWakeWindows(events),
  assertAfter: (events) => {
    const violators = findUnclampedWWs(events);
    if (violators.length > 0) {
      return `R3.5 violated: WW ${violators.map(v => v.eventKey).join(', ')} doesn't end at nap start`;
    }
    return null;
  },
};

// R7.4: drop naps starting at/after bedtime
const RuleDropNapsAtBedtime: Rule = {
  id: 'R7.4',
  description: 'Naps starting at/after bedtime are removed',
  dependsOn: ['R3.5'],   // need cascade times before checking
  matches: (events) => {
    const bedtime = events.find(e => e.type === 'bedtime');
    if (!bedtime) return false;
    return events.some(e =>
      e.type === 'nap' && e.startTime >= bedtime.startTime
    );
  },
  produces: (events) => {
    const bedtime = events.find(e => e.type === 'bedtime')!;
    return events.filter(e =>
      !(e.type === 'nap' && e.startTime >= bedtime.startTime)
    );
  },
};
```

A V3 ruleset is ~30–40 rules. Each rule is < 30 lines. Total engine
code: ~1500 lines including helpers, vs. V2's ~2000 across 12 files.

### 2.4 Rules organization

`src/v3/engine/rules/` — one file per domain area:
- `naps.ts` (R3.x)
- `wakeWindows.ts` (R4.x)
- `bottles.ts` (R5.x)
- `putdown.ts` (R6.x)
- `bedtime.ts` (R7.x)
- `dreamFeed.ts` (R8.x)
- `pumps.ts` (R9.x)
- `extras.ts` (R10.x)
- `cookDinner.ts` (R11.x)
- `owners.ts` (R12.x)

Each file exports `const RULES: Rule[]`. The top-level engine
concatenates and topo-sorts.

### 2.5 Why not Datalog / clipsjs / nools / clojure-rules

| Option | Pro | Con | Verdict |
|---|---|---|---|
| Real Datalog (e.g. `souffle`) | Powerful, efficient | Extra runtime, learning curve, Datalog expressions ≠ TS | Overkill |
| `clipsjs` | Production rules ergonomics | Last updated 2018, bundle bloat | Stale |
| `nools` | Forward-chaining engine | Imperative API, doesn't help our specific shape | Mediocre |
| `json-rules-engine` | Lightweight | Built for biz-rule checks (yes/no), not transformations | Wrong shape |
| **Hand-roll 200 lines** | Exactly what we need; in TS; debuggable | We have to maintain it | **Recommended** |

200 lines of clear TS beats a dependency we don't fully understand.
And we get exactly the failure modes we want (loud assertion errors
referencing rule ids).

---

## §3 The Pipeline (V3)

There is no pipeline. There is a rules array and an evaluator.

```ts
// src/v3/engine/projectDay.ts (~30 lines)
import { ALL_RULES } from './rules';
import { evaluate } from './evaluator';

export function projectDay(input: ProjectInput): Event[] {
  return evaluate(ALL_RULES, {
    day: input.day,
    settings: input.settings,
    template: input.template,
    actuals: input.actuals,
    nowMinutes: input.nowMinutes ?? 24 * 60,
  });
}
```

Compare to V2's 12-step `project.ts` with comments explaining "step 2b
must run before step 3 because..."

### 3.1 Where ordering still matters

Some rules genuinely depend on others (R7.4 depends on R3.5 because
it needs final cascade times). These are encoded in `dependsOn`. The
evaluator does a topological sort and runs rules in dependency order
within each pass.

If two rules are mutually dependent (rare but possible), one of them
needs to be split or merged with the other. The topo sort fails loudly
on cycles, surfacing the issue at startup, not in production.

---

## §4 State Machine for Lifecycle

```
                    ┌────────────────┐
                    │   projected    │ (engine output, never persisted)
                    └────┬───────────┘
                         │
       ┌─────────────────┼──────────────────┐
       │ Start Nap       │ Drawer save:      │ Drawer save:
       │ Start Bottle    │ time-edit         │ owner-only edit
       ▼                 ▼                   ▼
  ┌────────┐         ┌───────────┐      ┌─────────────┐
  │started │         │ completed │      │ overridden  │
  └───┬────┘         └─────▲─────┘      └──────┬──────┘
      │ End Nap            │                   │
      │ (or End Bottle)    │ Subsequent        │ Subsequent
      └────────────────────┘ time-edit         │ time-edit
                                               │
                                               ▼
                                         (transitions to completed)
```

**Invariants enforced**:
- Once `completed`, never returns to `projected`.
- Once `started`, only progresses to `completed`.
- `overridden` is reachable only from `projected` (drawer edit of
  projection).
- `started` events have no `endTime`; the End transition sets it.

**Implementation**:
- A reducer in `src/v3/lifecycle.ts` that takes `(currentLifecycle,
  action)` and returns new lifecycle. Invalid transitions throw with
  a clear message.
- Drawer + dashboard buttons dispatch through this reducer. No
  imperative `lifecycle: {state: 'completed'}` assignments anywhere
  else.

---

## §5 Migration Strategy

Strangler pattern. V2 keeps running. V3 ships incrementally behind a
feature flag.

### Phase 1 — V3 engine in isolation (1–2 weeks, no UI changes)

```
src/
  v3/
    engine/
      rules/             # Rule definitions per domain
      evaluator.ts       # ~200 line term-rewriter
      projectDay.ts      # public API mirror of V2's projectDay
      schemas.ts         # V3 types
      migrate.ts         # V2 → V3 conversion helpers
    lifecycle.ts         # state machine reducer
    index.ts             # public exports
  domain/                # V2 — untouched
```

- `pnpm test:v3` runs property-based tests against `EDGE_CASES.md` seeds.
- 100% of V2's test suite must equivalently pass for V3 (same input,
  same output).
- No UI changes. V2 is still wired to all four call sites.

**Exit criteria**: every edge case in EDGE_CASES.md passes property
testing. Zero regression vs. V2 on the same inputs.

### Phase 2 — Side-by-side comparison (1 week)

Add a settings flag: `engineVersion: 'v2' | 'v3'`. Default V2.

UI:
- Both engines run on every render (in dev mode) — output diffed.
- `/settings` exposes a dev toggle.
- A debug panel logs any diff between V2 and V3 outputs to console.

**Exit criteria**: Jake runs the app for 2–3 days with both engines
in shadow. Zero diffs reported.

### Phase 3 — Migrate UI surfaces (2–3 weeks, one PR each)

- PR-1: `/timeline` uses V3 (V2 still wired elsewhere).
- PR-2: `/day-templates` uses V3.
- PR-3: `/tomorrow` uses V3.
- PR-4: `/history` uses V3.
- Each PR: small, self-contained, can be reverted.

### Phase 4 — V3 default + cleanup (1 week)

- Flip `engineVersion` default to V3.
- Watch for 1 week.
- If stable, delete `src/domain/` (V2 engine).
- Drop the engineVersion flag.
- Drop V2 fallback in Firestore converter.

### Phase 5 — Wave 9 (1–2 weeks)

PWA manifest + service worker, E2E tests against V3, design audit, perf
review. The original Wave 9 from the V2 roadmap.

---

## §6 Test Strategy

### 6.1 Property-based tests (`fast-check`)

```ts
import fc from 'fast-check';

const arbActual = fc.record({...}); // generates valid Event docs
const arbDay = fc.record({...});

test.prop([fc.array(arbActual), arbDay, settingsArb])('R5.6: bottles never inside naps', (actuals, day, settings) => {
  const events = projectDay({ day, settings, actuals });
  for (const bottle of events.filter(e => e.type === 'bottle')) {
    for (const nap of events.filter(e => e.type === 'nap')) {
      const inside =
        bottle.startTime > nap.startTime &&
        bottle.startTime < (nap.endTime ?? Infinity);
      expect(inside).toBe(false);
    }
  }
});
```

Run with `numRuns: 1000+` per property in CI. Each property checks an
invariant from `REQUIREMENTS.md`.

### 6.2 Example-based tests (`EDGE_CASES.md` seeds)

Each entry in EDGE_CASES.md becomes a single test case:

```ts
test('EC-N1: late nap stretches preceding wake window', () => {
  const result = projectDay({
    day: makeDay({ wakeTime: 7*60 }),
    settings: makeSettings({ wakeWindowsMinutes: [120, 135, 135, 150] }),
    actuals: [recorded('nap_2', 13*60+30, 14*60+30)],
  });
  const ww2 = result.find(e => e.eventKey === 'wake_window_2')!;
  expect(ww2.endTime).toBe(13*60+30);
});
```

These act as guard-rails against regressions on specific historical
bugs. Property tests catch the general invariant; example tests catch
the specific case if the property test happens to miss the exact
generator output.

### 6.3 Component / integration tests

Largely unchanged from V2. RTL tests on the timeline, drawer, dashboard.
Write fewer of these; rely on engine-level property tests for
correctness, component tests for accessibility and layout.

### 6.4 V2 vs V3 differential tests (Phase 2 only)

```ts
test.prop([validProjectInputArb])('V3 output equals V2 output', (input) => {
  expect(projectDayV3(input)).toEqual(projectDayV2(input));
});
```

Run with `numRuns: 5000+`. This is the real safety net during the
strangler migration. Drops after Phase 4 cleanup.

---

## §7 Performance & Observability

### 7.1 Performance budget

- `projectDay` < 50ms per call on typical day (~100 events). V2 is
  already well under this; V3's evaluator passes are bounded.
- React re-renders not triggered on every minute tick — `useNowMinutes`
  + `nowBar` separate from event projection.
- Property tests run in < 30s for the full suite.

### 7.2 Observability

- `EvaluationError` carries the rule id and current event state. Easy
  to debug from the error message alone.
- Each rule has a `description`; if a rule is failing in production,
  the user-facing "something went wrong" can include the human-readable
  rule description.
- Optional dev-mode logging: `engine.evaluate` emits a trace of which
  rules fired, in which pass, and the diff each produced.

---

## §8 Open Questions for Jake

### [OPEN] Q1: Rules engine implementation — hand-roll vs. small lib?

**Recommendation**: hand-roll. ~200 lines, no dependencies, exactly
fits our shape. We control the failure modes.

**Alternative**: pull in `nools` or similar. Saves writing the
evaluator at the cost of working around its assumptions.

### [OPEN] Q2: V3 engine in same repo or extracted to a package?

**Recommendation**: same repo. Future "share with Kelly's friend's app"
might want extraction, but YAGNI for now.

### [OPEN] Q3: Lifecycle field — required on new V3 docs from day 1?

**Recommendation**: yes. Read-side migration handles legacy V2 docs;
write-side requires the new shape.

### [OPEN] Q4: Time as integer minutes vs. string "HH:MM"?

**Recommendation**: integer minutes internally, formatted at UI
boundary. Saves `parseTime`/`formatTime` calls scattered across rules.

**Trade-off**: Firestore docs will store integers, breaking V2 read
compatibility unless we coerce. Easy to do in the converter.

### [OPEN] Q5: Adopt fast-check for property testing?

**Recommendation**: yes. It's the de facto TS property-testing lib,
maintained, fast, plays nice with vitest.

### [OPEN] Q6: Wave 9 timing — strict end-of-Phase-5 or interspersed?

**Recommendation**: strict. Mixing in PWA work mid-rewrite is the
shortest path to a stuck branch.

### [OPEN] Q7: Should V3 introduce a "scenario" concept (templates that mutate during the day)?

V2 templates are static. Some real-world cases (Jake takes Daycare
naps; weekends are different) might benefit from runtime template
selection.

**Recommendation**: NOT in V3 scope. Add to OUT_OF_SCOPE.

### [OPEN] Q8: Per-day suppression of recurring projections (cook dinner)?

V2 has no way to "skip dinner today." V3 could add `Day.suppressedKeys:
string[]`.

**Recommendation**: ship in V3. Tiny addition; user-visible win.

---

## §9 Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Rules engine has edge cases we miss | Medium | High | Property tests + V2-V3 differential testing in Phase 2 |
| Migration takes > 10 weeks | High | Medium | Phases are independently shippable; can pause between phases without leaving broken state |
| Lifecycle state machine is too rigid | Low | High | Add `unknown` state as escape hatch; loud assertion if we hit it |
| V2 fallback in converter is permanent | Medium | Low | Set a quarterly review reminder to delete |
| Rules engine convergence issue | Low | High | MAX_PASSES safety net + assertion + escape hatch (drop into V2 path if eval fails) |
| Property tests reject reasonable shapes | Medium | Low | Iterate with Jake on the arbitraries; mark difficult invariants as "TODO: relax" |
| Bundle size regression | Low | Low | Engine is plain TS; if anything, smaller than V2's 12 files |
| Dev velocity slows during V3 build | High | Medium | Strangler keeps V2 running; bug fixes go to V2 normally |

---

## §10 Estimated Effort

Working sessions of ~2-4 focused hours, nights/weekends:

- **Phase 1** (engine + tests, no UI): 30-50 hours (3-5 sessions/week × 2 weeks)
- **Phase 2** (side-by-side, validation): 5-10 hours
- **Phase 3** (UI cutover, 4 PRs): 15-25 hours
- **Phase 4** (cleanup, V3 default): 5 hours
- **Phase 5** (Wave 9): 20-30 hours

**Total**: 75-120 focused hours. Calendar time: 6-10 weeks
nights/weekends. Less if life cooperates; more if it doesn't. The
strangler pattern means there's no "broken at week 4" intermediate
state.

---

## §10.5 Review Log

### Review 1 (Jake, 2026-05-08) — synced with REQUIREMENTS revisions

- **§1.1 Event/Lifecycle**: `Owner` replaced with `OwnerRef` (slot
  + optional otherId) for configurable owner slots.
- **§1.2 Day**: `cookDinnerSuppressed` renamed to
  `suppressedRecurringIds` (generalizes beyond cook dinner).
- **§1.3 OwnershipTemplate**: `displayName` field added; comments
  clarify wakeWindowOwners is template-only (no nap fallback in V3),
  bedtimeOwner has no lastNapOwner fallback.
- **§1.4 Settings**: added `defaultWakeTime`, `bottleChain`,
  `pumpOwnerSlot`, `dailyRecurring`, `owners`. V2 `cookDinner`
  migrated.
- **[OPEN] Q1 (rules engine impl)**: still recommend hand-roll;
  unchanged.
- **[OPEN] Q4 (time as integer minutes)**: still recommend; unchanged.
- **OUT_OF_SCOPE §3 (per-day suppression)**: ratified MOVED IN; now
  R11.6 in REQUIREMENTS.

---

## §11 Success Criteria

- [ ] Property tests pass: 100% of `EDGE_CASES.md` seeds + 5000+
      generated cases per property.
- [ ] V3 output matches V2 output for every observed real-world day
      from production data (Phase 2 differential testing).
- [ ] No new bugs reported in week 1 after V3 default flip.
- [ ] Engine code under 1500 LOC excluding rules.
- [ ] Each rule under 30 LOC.
- [ ] V3 default for 1 week → delete V2 engine code.
- [ ] Wave 9 ships within 2 weeks of V3 stable.

---

## Source References

- V2 source: `src/domain/*.ts` and the rest of the repo as of `main`.
- Companion: `docs/v3/REQUIREMENTS.md` (rules), `docs/v3/EDGE_CASES.md`
  (seeds), `docs/v3/OUT_OF_SCOPE.md` (non-goals).
- Strategy plan: `docs/V3_REWRITE_PLAN.md`.
- Locked decisions:
  `~/.claude/projects/.../memory/project_decisions.md`.
