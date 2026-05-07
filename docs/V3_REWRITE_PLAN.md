# V3 Rewrite — Prep Plan & Strategy

> Status: **PLAN.** No code changes yet. Owner: Jake (decisions) + Claude (drafting).
> Source of truth for the rewrite sequence. Update this as decisions land.

---

## Why a rewrite

Timeline V2 shipped a usable app, but the engine grew incrementally as bugs
surfaced. The result is correct enough to use day-to-day, but the rules are
implicit — scattered across `src/domain/*.ts` files — and every new feature
risks colliding with an undocumented edge case. This session alone surfaced:

- 3 different "what counts as recorded?" interpretations
- 2 cycles of "drawer save means recording" vs. "drawer save means annotation"
- Bottle ordering bugs that took 3 fixes to settle
- Wake-window stale-time clobber bugs
- Putdown-vanishes-on-owner-edit bugs
- Bedtime as instant vs. block reversed twice

These weren't dumb mistakes. They were the symptoms of trying to encode
domain rules into ad-hoc TypeScript pipelines. The fix isn't "more
TypeScript discipline"; it's a different shape — a small rules engine
where domain invariants are first-class declarations, not derived from
the imperative order of pipeline steps.

---

## Frozen state — V2 baseline

Before any V3 work, V2 must be frozen. "Frozen" means:

- [ ] PR #35 (`feat/timeline-v2-redesign`) merged to `main`.
- [ ] Dashboard button followups (per `docs/DASHBOARD_BUTTON_TODO.md`) shipped
      OR explicitly deferred. Either is fine; we just need to know the state.
- [ ] `docs/BUILD_STATUS.md` updated to reflect "V2 shipped; V3 prep starting."
- [ ] No open work-in-progress branches that touch the engine.

Once frozen, V2 runs in production for daily use through the entire V3
rewrite. We never break the running app to do the rewrite — V2 is the
ground truth users (= Jake + Kelly) interact with until V3 is ready to
swap in. **The strangler pattern is non-negotiable here.**

---

## The prep doc set — what Claude produces next

When Jake says "go," Claude reads the entire `src/` tree + git log + every
plan doc + screenshots-in-context, and produces the following docs in
`docs/v3/`. **No code changes during this phase.**

### `docs/v3/REQUIREMENTS.md`

Every domain rule in plain English, in one place. Sourced from:
- `TIMELINE_V2_PLAN.md` decisions
- `DASHBOARD_BUTTON_TODO.md` requirements
- The implicit rules in `src/domain/*.ts` (extracted by reading each file)
- Screenshots in conversation history (rules surfaced via testing)
- Jake's locked decisions in `~/.claude/projects/...memory/project_decisions.md`

Format: numbered rules grouped by domain (Naps, Bottles, Bedtime, Owners,
Putdowns, Dream Feed, Pumps, Custom Events, Cook Dinner, Day Lifecycle).
Each rule has a one-line statement + "why" + "edge case it prevents."

Estimated size: 80–120 numbered rules. If it's much bigger we're conflating
implementation details with rules.

### `docs/v3/EDGE_CASES.md`

A table of `(input scenario) × (expected output)` ready to feed into a
property-based test suite. Format:

```
Scenario: nap_2 actual at 11:00, projected nap_3 at 13:00
Expected: nap_3 cascades from nap_2.endTime, no overlap visible, ...
Source: bottleOverlap session 2026-05-07
```

Comes from every bug in the git log. Roughly: walk every fix commit and
extract "the input that broke + what the fix made true." Each becomes
a row.

Estimated size: 200–300 rows. This is the regression suite for V3.

### `docs/v3/ARCHITECTURE_V3.md`

The proposed shape. Contains:

1. **Data model**: cleaned-up Event type. Drop the `source`/`status`
   tangle — likely consolidate into a single explicit lifecycle field.
2. **Rules engine choice**: my current lean is a small Datalog-flavored
   evaluator (think 100 lines of TS, not a dependency). Alternatives:
   plain rules-as-functions registered in an ordered table; or pulling
   in a real lib (e.g., `clipsjs`, `nools`). Pros/cons doc'd, decision
   pending Jake.
3. **Pipeline shape**: instead of a 10-step imperative pipeline,
   declare invariants the output must satisfy. The engine derives the
   resolution order, not us.
4. **State machine for events**: `projected → started → completed →
   overridden → archived`, with allowed transitions enumerated.
5. **Strangler migration phasing**: how V3 ships behind a flag, runs on
   the same Firestore data, and progressively replaces V2 module by
   module.
6. **Test strategy**: property-based tests against `EDGE_CASES.md`
   replace most of the unit tests. Visual regression via Playwright
   for the timeline. Engine tests stay unit-level.

### `docs/v3/OUT_OF_SCOPE.md`

Explicit "we are NOT doing this in V3" list. Drafted by Claude, ratified
by Jake. Examples (Jake to confirm/edit):
- Multi-child support
- Sharing with non-allowlisted users
- CSV export
- Push notifications
- Voice input
- Widget / lockscreen integration

Anything left out becomes a backlog item, not a V3 surprise.

---

## Strategy — strangler migration, not rewrite-then-swap

V3 ships incrementally:

1. **Phase 0 — Prep docs (1 week, no code)**
   Claude produces the doc set. Jake reviews, pushes back, refines. Iterate
   until Jake approves all four docs.
2. **Phase 1 — V3 engine in isolation (1–2 weeks)**
   New `src/domain/v3/` directory. Engine implemented + property tests
   passing. NOT wired into UI yet. V2 remains the live engine.
3. **Phase 2 — Side-by-side (1 week)**
   Settings flag: `engineVersion: 'v2' | 'v3'`. Default V2. Dev-mode
   toggle in `/settings` lets Jake switch and compare. Both engines run
   on the same Firestore data.
4. **Phase 3 — Migrate UI surfaces (2–3 weeks)**
   Each timeline call site (`/timeline`, `/day-templates`, `/tomorrow`,
   `/history`) re-points to V3 one at a time. Each move is a PR.
5. **Phase 4 — V3 default + clean up (1 week)**
   Flip `engineVersion` default to V3. Add metrics / logs to confirm no
   regressions in production. Wait 1 week. If stable, delete V2
   directory + flag.
6. **Phase 5 — Wave 9 (the original)**
   With V3 stable, finally tackle the deferred `Wave 9` items: PWA
   manifest, service worker, E2E tests for critical flows,
   `/design-audit`, `/visual-qa`. Estimated 1–2 weeks.

Total estimate: **6–10 weeks calendar time** for V3 + Wave 9, working
nights/weekends. Could be faster with focused stretches; slower if life
intervenes. Either is fine — the V2 app is running through it.

---

## The rules-engine bet

The architectural change with the highest leverage is making rules
declarative. Sketch (subject to refinement in `ARCHITECTURE_V3.md`):

```ts
// V2-style imperative pipeline (current):
events = applyNapActuals(events, actuals, settings);
events = applyWakeWindowOverrides(events, actuals);
events = applyBedtime(events, settings, actuals);
// ...8 more steps; order matters; each step's effects must be
//   anticipated by every later step.

// V3-style declarative invariants (proposed):
const rules: Rule[] = [
  rule("bottle never inside nap", { /* derivation */ }),
  rule("WW N owner = nap N owner unless explicit", { /* derivation */ }),
  rule("bedtime caps the day", { /* derivation */ }),
  // ~30 rules total, each isolated and tested in isolation.
];
const events = engine.solve({ day, settings, actuals, template, rules });
```

The engine resolves the rules to a fixed point. We never write
"applyBedtime must run before applyWakeWindowOverrides" — that ordering
is derived from the rules' dependencies. Most of this session's bugs
were ordering bugs; this design makes them impossible.

The risk: this is a learning curve. Datalog-flavored evaluators have
sharp edges. Will dig into trade-offs in `ARCHITECTURE_V3.md`.

---

## Wave 9 (the original) — where it slots

`Wave 9` from the original Plan C roadmap (PWA + E2E + design audit) is
explicitly **after** the V3 swap, not before. Reasons:

- E2E tests written against V2 would all break in V3 anyway. Better to
  write them against the stable V3 surface.
- Design-audit / visual-qa works best against the design system in its
  finished state. V3 may consolidate styles further.
- PWA manifest + service worker doesn't need to change between V2 and
  V3 — it's surface, not engine — but it's also a one-shot ship; once
  V3 is stable, this is a ~3 day side quest.

Wave 9 stays parked until the V3 swap is complete (Phase 4).

---

## Session memory note

This plan, plus `docs/v3/REQUIREMENTS.md` etc. once produced, replaces
the patchwork of `TIMELINE_V2_PLAN.md` and `DASHBOARD_BUTTON_TODO.md`
as the active forward-looking docs. Those become historical references
once V3 ships.

The session memory at `~/.claude/projects/.../memory/project_decisions.md`
should be updated to point to this doc as the "current strategy"
reference. Older locked-decisions remain valid — they fed into V2 and
will feed into V3's `REQUIREMENTS.md`.

---

## Trigger to execute

When Jake is ready, send a single message:

> "Go — produce the V3 prep doc set."

Claude will:
1. Read the codebase end-to-end (no edits).
2. Walk the entire git log.
3. Surface every implicit rule into `REQUIREMENTS.md`.
4. Surface every fixed bug into `EDGE_CASES.md`.
5. Propose `ARCHITECTURE_V3.md` with explicit alternatives.
6. Draft `OUT_OF_SCOPE.md` for Jake to ratify.

Estimated wall-clock: ~2–3 hours of focused work for Claude. Output is
four docs in `docs/v3/`. Jake reviews, pushes back, iterates. Iteration
is cheap; rewriting code is expensive.

---

## Decisions log (running)

- 2026-05-07: V2 declared "done"; V3 rewrite-prep authorized.
- 2026-05-07: Strangler-migration strategy chosen over big-bang rewrite.
- 2026-05-07: Rules engine direction proposed (lean: small Datalog-style
  evaluator); final choice pending `ARCHITECTURE_V3.md`.
- 2026-05-07: Wave 9 (PWA + E2E + design audit) parked until after V3
  swap (Phase 5).

(Append new decisions with date + one-liner as they happen.)
