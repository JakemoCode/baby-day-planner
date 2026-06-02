# V3 Architecture

> Status: **SHIPPED.** Phases 1–5 complete; V2 wiped in PR-C1 (2026-05-11).
> This doc is the canonical reference for the engine's shape — data
> model, rules, evaluator, lifecycle state machine. Open questions in §8
> were resolved before the build; the §10 effort estimates were historical
> and have been removed.

> Companion docs: [`ENGINE_SPEC.md`](ENGINE_SPEC.md) (engine rules),
> [`DATA_MODEL.md`](DATA_MODEL.md) (schema + lifecycle),
> [`RENDER_SPEC.md`](RENDER_SPEC.md) (display rules),
> [`EDGE_CASES.md`](EDGE_CASES.md) (regression seed),
> [`OUT_OF_SCOPE.md`](OUT_OF_SCOPE.md) (what we're NOT doing).

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
  type: EventType;
  kind: EventKind;                // 'block' | 'instant' (derived from type+endTime)

  // Time
  startTime: TimeMin;             // minutes since midnight (24+ for cross-day)
  endTime?: TimeMin;              // present iff kind === 'block'

  // Domain attributes
  label: string;
  owner?: Owner;
  amountOz?: number;              // bottle only

  // Putdown — render-only reminder. true ⇒ renderer prepends a
  // virtual putdown block. Set by rules; never persisted (the parent
  // event itself is what's persisted). See R6.1.
  hasPutdown: boolean;

  // Lifecycle (replaces V2's source + status + recorded triplet).
  // Always present for type-uniformity; for wake_window it's
  // synthetically `{state: 'projected'}` (wake windows are always
  // derived from nap interval rules, never recorded directly).
  // Putdown has no Event doc at all (render-only — R6.1), so this
  // field doesn't apply there.
  lifecycle: Lifecycle;
};

type Lifecycle =
  | { state: 'projected' }                          // engine-emitted
  | { state: 'started';   committedAt: TimeMin }    // dashboard Start, no End yet
  | { state: 'completed'; committedAt: TimeMin }    // Start+End, FAB-create, time-edit
  | { state: 'overridden'; annotatedAt: TimeMin };  // owner-only annotation

type EventKind = 'block' | 'instant';

// Hard list — exhaustive switch checks should be possible everywhere.
// Add a new event type? Update this union and the compiler tells you
// every site to handle it.
type EventType =
  | 'nap'              // block; lifecycle applies
  | 'wake_window'      // block; ALWAYS derived from nap interval rules
                       //   (synthesized between consecutive naps, between
                       //   day-start and nap_1, and between last_nap and
                       //   bedtime). Never user-recorded directly.
                       //   `lifecycle` is always `{state: 'projected'}`.
  | 'bottle'           // instant; lifecycle applies
  | 'bedtime'          // block; lifecycle applies
  | 'pump'             // instant; lifecycle applies
  | 'extra'            // block or instant; lifecycle applies (custom user events)
  | 'daily_recurring'  // block or instant; lifecycle applies (R11 — replaces V2's `cook_dinner`)
  | 'daycare_dropoff'  // instant; lifecycle applies (R21)
  | 'daycare_pickup';  // instant; lifecycle applies (R21)

// V2 had `'putdown'` and `'wake'`. V3 removes both:
// - `putdown` is render-only (R6.1); see `Event.hasPutdown` flag.
// - `wake` was redundant with `Day.wakeTime`; the wake moment is
//   derived from the Day record (R14.4), not stored as an Event.

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

### 1.1.5 Auth / membership

V3 replaces the hardcoded allowlist with a Firestore-managed
membership doc (R22).

```ts
// Firestore: /config/allowlist (singleton)
type AllowlistDoc = {
  emails: string[];           // lowercase, deduped, full-access only
  updatedAt: Timestamp;
  updatedBy: string;          // email of last editor
};
```

Rules:
```js
function isAllowlisted() {
  return request.auth != null
    && request.auth.token.email in
       get(/databases/$(database)/documents/config/allowlist).data.emails;
}
match /config/allowlist {
  // Any signed-in user can read (so the client can subscribe and
  // gate the auth flow).
  allow read: if request.auth != null;
  // Only current members can write — prevents arbitrary signup.
  allow write: if isAllowlisted();
}
```

Client:
- `useAllowlist()` — `onSnapshot` subscription cached in an auth
  context provider. Auth flow blocks on first read; subsequent
  changes propagate live.
- The legacy `src/lib/auth/allowlist.ts` constant is deleted at the
  V3 cutover (Phase 4).

Bootstrap: a seed script (`pnpm seed:allowlist`) writes the doc with
the founding members on a fresh Firestore. Documented in README. No
migration of existing data is needed since V2 isn't deployed.

### 1.2 Day shape

Adds:
- `suppressedRecurringIds: string[]` — per-day skip of recurring
  projections (see R11.6).

Drops (vs V2):
- `archivedAt: string` — V2 stamped this on archive; V3 just flips
  `status: "archived"`. Engine doesn't read it; `Day.date` carries
  chronological order for history.
- `createdAt: string` — V2 stamped this on day creation; V3 doesn't
  carry it. Same rationale (engine doesn't read; date suffices).
- `ownershipTemplateId: string` — renamed to `templateId` in V3.
  `withV3DayDefaults` (PR-A0.1) remaps reads of legacy V2 docs
  during the cutover; remap drops in PR-C1.

`startNewDay` (PR-A0.2) is non-atomic by design: the active-day
query happens outside the transaction (Firestore can't run
collection queries inside `runTransaction`). Race window between
query and transaction is acceptable in single-family deployment;
worst case is a brief overlap of two active days resolved by the
watcher reading the most recent.

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
Settings.bedtimeThreshold: TimeMin;           // R7.6 — probability shaper
Settings.defaultNapLengthMinutes: number;     // R7.6.1 — drives convert-prompt window
Settings.bottleChain: {
  bufferAfterWakeMinutes: number;             // R5.11 — wake→first-placeholder anchor
  // No daily-count target, no upper bound, no fixed latest-projected-
  // start; the chain fills the day from the cascade itself (R5.8, §F66).
};
Settings.napDurationMin: number;              // R3.10.1 — soft warning floor
Settings.napDurationMax: number;              // R3.10.1 — soft warning ceiling
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
Settings.daycare: {                           // R21 — daycare dropoff/pickup
  enabled: boolean;
  dropoffTime: TimeMin;
  pickupTime: TimeMin;
  ownerId: string;                            // refs Settings.owners.other[].id
  weekdays: {                                 // R21.2 — which days project daycare
    mon: boolean; tue: boolean; wed: boolean;
    thu: boolean; fri: boolean; sat: boolean; sun: boolean;
  };
};
```

`Day.suppressedDaycareDay: boolean` is the per-day opt-out (R21.5).

V2 `Settings.cookDinner` migrated to a single `dailyRecurring` entry
on read; the field is dropped going forward.

---

## §2 The Rules Engine

### 2.0 Reality-wins axiom (encodes REQUIREMENTS §0)

Before any rule fires, `ctx.actuals` enters the events array unchanged.
Rules MAY add projected events, MAY transform projected events, MAY
remove projected events. Rules MAY NOT mutate or remove any event
whose `lifecycle.state ∈ {'started', 'completed'}` ("recorded
events"). Owner edits via the drawer transition projected → completed
*before* evaluation; the rules see the result, never operate on a
state transition.

Implementation:
- Each rule's `produces` runs through a guard helper:
  ```ts
  function safeProduces(rule: Rule, events: Event[], ctx: Context): Event[] {
    const recordedBefore = events.filter(isRecorded);
    const next = rule.produces(events, ctx);
    const recordedAfter = next.filter(isRecorded);
    if (!sameSet(recordedBefore, recordedAfter)) {
      throw new EvaluationError(
        rule.id,
        `rule violated reality-wins axiom: recorded event added/removed/mutated`,
        next
      );
    }
    return next;
  }
  ```
- This is the engine-level expression of the §0 philosophy in
  REQUIREMENTS. If any rule tries to drop or rewrite a recorded
  event, the engine throws loudly with the rule id.

### 2.1 Rule shape

```ts
type Rule = {
  id: string;                              // 'R3.5' from ENGINE_SPEC.md
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

// R7.4: stop projecting naps at/after bedtime (recorded naps are kept)
const RuleStopProjectingNapsAtBedtime: Rule = {
  id: 'R7.4',
  description: 'Projected naps starting at/after bedtime are removed; recorded naps stand (§0 reality-wins)',
  dependsOn: ['R3.5'],   // need cascade times before checking
  matches: (events) => {
    const bedtime = events.find(e => e.type === 'bedtime');
    if (!bedtime) return false;
    return events.some(e =>
      e.type === 'nap' &&
      e.lifecycle.state === 'projected' &&
      e.startTime >= bedtime.startTime
    );
  },
  produces: (events) => {
    const bedtime = events.find(e => e.type === 'bedtime')!;
    return events.filter(e =>
      !(e.type === 'nap' &&
        e.lifecycle.state === 'projected' &&
        e.startTime >= bedtime.startTime)
    );
  },
};
```

```ts
// R21.3: projected naps/bottles inside daycare window auto-assign daycare
const RuleAssignDaycareWindowOwner: Rule = {
  id: 'R21.3',
  description: 'Projected naps and bottles inside [dropoff, pickup) inherit daycare owner',
  dependsOn: ['R3.5', 'R5.1'],   // need final cascade times
  matches: (events, ctx) => {
    if (!ctx.settings.daycare.enabled) return false;
    if (!isDaycareWeekday(ctx)) return false;   // R21.2 weekday gate
    if (ctx.day.suppressedDaycareDay) return false;
    const dropoff = events.find(e => e.type === 'daycare_dropoff');
    const pickup  = events.find(e => e.type === 'daycare_pickup');
    if (!dropoff || !pickup) return false;
    return events.some(e =>
      (e.type === 'nap' || e.type === 'bottle') &&
      e.lifecycle.state === 'projected' &&
      !e.owner &&                      // template/manual didn't already set
      e.startTime >= dropoff.startTime &&
      e.startTime <  pickup.startTime
    );
  },
  produces: (events, ctx) => {
    const dropoff = events.find(e => e.type === 'daycare_dropoff')!;
    const pickup  = events.find(e => e.type === 'daycare_pickup')!;
    const daycareOwner: OwnerRef = {
      slot: 'other',
      otherId: ctx.settings.daycare.ownerId,
    };
    return events.map(e => {
      if (
        (e.type === 'nap' || e.type === 'bottle') &&
        e.lifecycle.state === 'projected' &&
        !e.owner &&
        e.startTime >= dropoff.startTime &&
        e.startTime <  pickup.startTime
      ) {
        return { ...e, owner: daycareOwner };
      }
      return e;
    });
  },
};
```

A V3 ruleset is ~30–40 rules. Each rule is < 30 lines. Total engine
code: ~1500 lines including helpers, vs. V2's ~2000 across 12 files.

### 2.4 Rules organization

`src/v3/engine/rules/` — one file per domain area:
- `naps.ts` (R3.x + R7.x — the sleep cascade emits bedtime inline at threshold)
- `wakeWindows.ts` (R4.x)
- `bottles.ts` (R5.x)
- `putdown.ts` (R6.x)
- `pumps.ts` (R9.x)
- `extras.ts` (R10.x)
- `cookDinner.ts` (R11.x) — naming TBD; rename to `dailyRecurring.ts`
- `daycare.ts` (R21.x)
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
       │ Start Nap       │ Start Bottle Now  │ Drawer save:
       │ (block events   │ FAB-create        │ owner-only edit
       │ only)           │ Drawer time-edit  │
       ▼                 ▼                   ▼
  ┌────────┐         ┌───────────┐      ┌─────────────┐
  │started │         │ completed │      │ overridden  │
  └───┬────┘         └─────▲─────┘      └──────┬──────┘
      │ End Nap            │                   │
      │ (block events      │ Subsequent        │ Subsequent
      │ only)              │ time-edit         │ time-edit
      └────────────────────┘                   │
                                               ▼
                                         (transitions to completed)
```

**Invariants enforced**:
- The `started` state applies ONLY to block-kind events (`nap`,
  `bedtime`, and any `extra` / `daily_recurring` configured with a
  duration). Instant events (`bottle`, `pump`, instant
  extras) record start + any payload in one tap and transition
  `projected → completed` directly. There is no "End Bottle".
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

test.prop([fc.array(arbActual), arbDay, settingsArb])(
  'R5.6: PROJECTED bottles are never inside PROJECTED naps',
  (actuals, day, settings) => {
    const events = projectDay({ day, settings, actuals });
    const projectedBottles = events.filter(
      e => e.type === 'bottle' && e.lifecycle.state === 'projected'
    );
    const projectedNaps = events.filter(
      e => e.type === 'nap' && e.lifecycle.state === 'projected'
    );
    for (const bottle of projectedBottles) {
      for (const nap of projectedNaps) {
        const inside =
          bottle.startTime > nap.startTime &&
          bottle.startTime < (nap.endTime ?? Infinity);
        expect(inside).toBe(false);
      }
    }
  }
);

// Companion property: §0 reality-wins. Recorded events pass through
// unchanged regardless of overlap with projected or other recorded
// events.
test.prop([fc.array(arbActual), arbDay, settingsArb])(
  '§0: recorded events in actuals appear unchanged in output',
  (actuals, day, settings) => {
    const events = projectDay({ day, settings, actuals });
    for (const actual of actuals.filter(isRecorded)) {
      const out = events.find(e => e.id === actual.id);
      expect(out).toBeDefined();
      expect(out!.startTime).toBe(actual.startTime);
      expect(out!.endTime).toBe(actual.endTime);
      expect(out!.lifecycle).toEqual(actual.lifecycle);
    }
  }
);
```

Run with `numRuns: 1000+` per property in CI. Each property checks an
invariant from `ENGINE_SPEC.md`.

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
test.prop([validProjectInputArb])(
  'V3 output equals V2 output (within philosophy carve-out)',
  (input) => {
    expect(projectDayV3(input)).toEqual(projectDayV2(input));
  }
);
```

Run with `numRuns: 5000+`. This is the real safety net during the
strangler migration. Drops after Phase 4 cleanup.

**Philosophy carve-out — expected divergences.** REQUIREMENTS §0
intentionally changes behavior at a few boundaries; differential
testing exempts inputs that exercise them. The arbitrary
`validProjectInputArb` filters these out (`.filter(input => !exercisesDivergence(input))`):

| Divergence | V2 behavior | V3 behavior (§0) |
|---|---|---|
| Recorded nap crossing bedtime | dropped | kept (R7.5) |
| Recorded nap after manual bedtime | dropped | kept (R7.7) |
| Recorded WW crossing manual bedtime | clipped | kept full (R7.7) |
| Recorded bottle inside a recorded nap | moved to nap edge | kept (R5.6) |
| Bottle chain count past V2's implicit cap | suppressed | continues until tomorrow (R5.8) |
| Putdown event in Firestore | persisted | render-only, never persisted (R6.1) |

A separate suite asserts each divergence directly (V2 produces shape
A, V3 produces shape B). That suite ships with the philosophy
documentation and survives Phase 4 cleanup as a regression guard.

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

## §8 Open Questions — Resolved

All questions answered Jake 2026-05-08. Decisions below are locked
unless explicitly re-opened.

### Q1: Rules engine implementation — RESOLVED → hand-roll

~200 lines, no dependencies, exactly fits our shape. We control the
failure modes.

### Q2: V3 engine in same repo or extracted to a package — RESOLVED → same repo, separate folder

Lives at `src/v3/` for the duration of the strangler migration. Easy
cut-over: when V2 is deleted in Phase 4, V3 stays at `src/v3/` (or
moves to `src/domain/`, naming TBD at cut-over).

### Q3: Lifecycle field on V3 docs from day 1 — RESOLVED → yes

No V2 production data exists (app not deployed). Local Firestore
emulator can be wiped freely. Read-side `migrateEventV2toV3` becomes
a documented helper rather than a daily fallback; can be deleted
once Phase 1 is past dev iteration.

### Q4: Time as integer minutes vs. string — RESOLVED → integer minutes

Internal representation is `TimeMin` (integer minutes since midnight,
24+ for cross-day). UI boundary always formats to `"HH:MM"` (12-hour
AM/PM in user-facing surfaces, per project_decisions). No V2 data
risk — Firestore emulator gets reset locally; nothing deployed.

### Q5: fast-check for property tests — RESOLVED → yes

### Q6: Wave 9 timing — RESOLVED → strict end-of-Phase-5

No PWA work intermixed with the engine rewrite.

### Q7: Should V3 introduce a "scenario" concept? — RESOLVED (with caveat)

**Decision: NOT in V3 scope.**

#### Why this question existed and why it dissolves

V2 templates are *manually-selected* day blueprints. The user picks
"Weekday" or "Weekend" or "Daycare Day" when starting a new day.
"Scenarios" was the idea of making selection automatic and/or
mid-day mutable based on context: day-of-week, calendar date, a
runtime "switch templates now" action.

Concrete imagined uses:
- **Auto-pick by weekday**: M–F → "Weekday template"; Sat/Sun →
  "Weekend template". User never has to choose.
- **Mid-day switch**: kid was at daycare until pickup, then home
  with grandma — switch to "evening at grandma's" template at
  16:30.
- **Holiday/calendar override**: Christmas → "Holiday" template;
  travel days → "Travel" template.

The first case (weekday auto-pick) is partially solved already by:
- `Settings.daycare.weekdays` (R21.2) — daycare events project only
  on configured days
- `Day.suppressedDaycareDay` (R21.5) — manual same-day opt-out

The second case (mid-day switch) is solved by manual template
selection at start-of-day plus drawer edits during the day.

The third case (calendar overrides) is real but rare; solving it
adds a calendar dependency and a UI to manage exceptions — heavy
machinery for a few days a year.

**The remaining value of scenarios is small enough that V3 doesn't
need them.** Templates remain static; the user picks one when
starting the day; daycare config covers the most common
"is-it-a-daycare-day" question.

If a real pattern emerges in usage (e.g., "I keep forgetting to
flip from Weekday to Weekend on Saturdays"), revisit in V4 with a
narrower question: "auto-pick template by weekday?" That question
is far cheaper than building a general scenario system.

**Action**: add to `OUT_OF_SCOPE.md` with rationale.

### Q8: Per-day suppression of recurring projections — RESOLVED

Ratified Review 1 (2026-05-08). Now `Day.suppressedRecurringIds:
string[]` per R11.6.

### Q9: `nowMinutes` reconciliation in stale tabs — RESOLVED → once-per-minute + on focus

`useNowMinutes` hook re-runs `projectDay` on a 60-second tick while
the tab is visible, plus immediately on `visibilitychange` when the
tab regains focus. Memoized within the same minute to avoid
redundant evaluation.

### Q10: Is the `overridden` lifecycle state still needed — RESOLVED → keep (option A)

Keeps the engine state machine cohesive: a user-assigned owner on a
not-yet-started event is a real distinction the dashboard ordinal
logic needs (`recorded ⇒ count toward "next nap N+1"`; `overridden ⇒
doesn't count`). Costs nothing.

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

_Historical effort estimates removed — all phases shipped (Phase 1–4
through PR-C1 on 2026-05-11; Phase 5 / Wave 9 pending)._

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

### Review 2 (Jake, 2026-05-08) — synced with REQUIREMENTS Reviews 3 & 4

- **§1.1 Event**: added `hasPutdown: boolean` flag (putdown is
  render-only — see R6.1). Lifecycle field comment now lists which
  event types it applies to (excludes wake_window, putdown).
- **§1.4 Settings**: replaced `bottleChain.{maxBottlesPerDay,
  latestProjectedStart}` with just `bottleChain.bottlesPerDay`
  (Review 3, R5.8/R5.11). Added `bedtimeThreshold`,
  `defaultNapLengthMinutes`, `napDurationMin`, `napDurationMax`.
- **§2.0** (new): Reality-wins axiom. Encodes REQUIREMENTS §0 as
  an engine-level invariant. `safeProduces` guard wraps every rule;
  any rule that mutates a recorded event throws.
- **§2.3 R7.4 sample**: rewritten to filter only *projected* naps
  (Review 4, R7.4). Recorded naps after bedtime are kept.
- **§6.1 property test sample**: tightened to "*projected* bottles
  never inside *projected* naps" (Review 4, R5.6). Companion property
  asserts §0 — recorded events appear unchanged in output.
- **§6.4 V2-vs-V3 differential**: added philosophy carve-out table
  documenting expected divergences; differential arbitrary filters
  these out; separate divergence-assert suite ships as a permanent
  regression guard.
- **Q8**: marked RESOLVED (per-day suppression already ratified).
- **Q9** (new): nowMinutes reconciliation in stale tabs.
- **Q10** (new): is the `overridden` lifecycle state still needed?

### Review 5 (Jake, 2026-05-08) — Settings-managed allowlist

- **§1.1.5** (new): allowlist moves from hardcoded constant +
  Firestore rules to a single `/config/allowlist` doc. Rules use
  `get()` membership check. Client subscribes via `useAllowlist()`.
- Seed script for founding-member bootstrap; no data migration
  (V2 not deployed).
- OUT_OF_SCOPE §2.5 moved-in; §2 (role-based sharing) confirmed-out.
- REQUIREMENTS §22 carries the user-visible rules (Settings UI,
  guards, etc.).

### Review 4 (Jake, 2026-05-08) — All open questions answered

- **Q1** hand-roll rules engine ✓
- **Q2** same repo, separate folder (`src/v3/`) for cut-over ✓
- **Q3** lifecycle on V3 docs day 1 (no V2 data exists) ✓
- **Q4** integer minutes internally, formatted at UI boundary ✓
- **Q5** fast-check ✓
- **Q6** strict Wave 9 timing ✓
- **Q7** scenarios NOT in V3 scope; daycare weekdays + manual
  template selection covers common cases. Revisit narrow question
  "auto-pick template by weekday?" only if needed in V4. Adds to
  OUT_OF_SCOPE.
- **Q9** `nowMinutes`: 60s tick while visible + on `visibilitychange` ✓
- **Q10** keep `overridden` state — option A ✓

§8 is now fully resolved. Phase 1 is unblocked once Jake sweeps
remaining `proposed-out` items in OUT_OF_SCOPE.md.

### Review 3 (Jake, 2026-05-08) — Daycare config

- **§1.1 EventType**: added `daycare_dropoff`, `daycare_pickup`
  (instants).
- **§1.4 Settings**: added `daycare: { enabled, dropoffTime,
  pickupTime, ownerId, weekdays }` — last is a per-weekday flag
  record so "Tue/Thu only" config works.
- **§1.4 Day**: `suppressedDaycareDay: boolean` for per-day opt-out.
- **§2.3 Sample rule**: added `RuleAssignDaycareWindowOwner` (R21.3)
  — projected naps/bottles inside the daycare window auto-assign
  daycare owner. Gates on enabled + weekday + not-suppressed.
- **§2.4 Rules organization**: added `daycare.ts`.

---

## §11 Success Criteria

_Criteria met through PR-C1 (2026-05-11):_

- [x] Property tests pass: 100% of `EDGE_CASES.md` seeds + generated cases per property.
- [x] V3 output matches V2 output for observed real-world days (Phase 2 differential testing).
- [x] Engine code under 1500 LOC excluding rules.
- [x] Each rule under 30 LOC.
- [x] V3 default → delete V2 engine code (PR-C1 wiped V2 wholesale).

_Pending:_

- [ ] Wave 9 (PWA + E2E + design audit).

---

## Source References

- V2 source: deleted in PR-C1; reachable via `git log -- src/domain/`.
- Companion: [`ENGINE_SPEC.md`](ENGINE_SPEC.md) (engine rules),
  [`DATA_MODEL.md`](DATA_MODEL.md) (schema + lifecycle),
  [`RENDER_SPEC.md`](RENDER_SPEC.md) (display rules),
  [`EDGE_CASES.md`](EDGE_CASES.md) (regression seeds),
  [`OUT_OF_SCOPE.md`](OUT_OF_SCOPE.md) (non-goals).
- Strategy plan (historical): `docs/_archive/V3_REWRITE_PLAN.md`.
- Locked decisions:
  `~/.claude/projects/.../memory/project_decisions.md`.
