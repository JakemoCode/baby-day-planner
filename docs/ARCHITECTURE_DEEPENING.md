# Architecture Deepening Candidates — 2026-05-20

> Working list from an `/improve-codebase-architecture` pass. Each
> candidate is self-contained so it can be assigned to its own
> session without reading the others.
>
> **Vocabulary** —
> - **Module / Interface / Implementation / Depth / Seam / Adapter** per the standard glossary.
> - **Deletion test**: imagine deleting the Module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, the Module earns its keep.
> - **The Interface is the test surface.**
>
> Domain language follows `DOMAIN.md` (cascade, putdown, dream feed,
> midnight rule, projected/recorded/completed lifecycle, etc.).

Six candidates plus two excluded-but-flagged items. Ordered roughly by
leverage-per-effort, not by importance.

---

## Status legend

- `pending` — not yet started
- `in-progress` — actively being worked on
- `done` — landed; mark with PR # and remove if you want to keep the list short
- `excluded` — surfaced but explicitly out-of-scope for deepening

---

## §A — `useDrawer`: collapse the projected-event re-save protocol

**Status:** `done` — PR #202

**Files involved**
- `src/app/(signed-in-with-child)/page.tsx` (Dashboard)
- `src/app/(signed-in-with-child)/timeline/page.tsx`
- `src/app/(signed-in-with-child)/tomorrow/page.tsx`
- shares the `EventEditDrawerV3` component (no changes to that)

**Problem**

Three pages duplicate the same `DrawerState` discriminated union AND
the same "if editing a projected event, re-ID before save" decision.
The implementations have **already diverged**: Timeline uses the
correct `recorded_${eventKey}` deterministic ID (post-PR #186);
Dashboard still uses random `newEventId("manual")`, which is the
exact pattern that caused the "intermittent wake-window owner change"
bug Timeline's comment apologizes for. The bug fix landed in one
file; the latent bug stayed in another.

**Friction sign**

Three identical `DrawerState` types. Three slightly-different `onSave`
closures. One PR-history comment in `timeline/page.tsx` proving the
divergence is load-bearing.

**Deletion test**

Pass — the routing rule (projected vs persisted → re-ID strategy) is
real Domain logic; concentrating it in one Module eliminates the bug
class.

**Provisional direction**

Extract `useDrawer(actuals, saveEvent, deleteOptimistic)` returning
`{ drawer, openCreate(template), openEdit(event), close, onSave, onDelete }`.
The hook owns:
- `DrawerState` discriminated union
- The projected-vs-persisted predicate
- The `recorded_${eventKey}` re-ID strategy (standardized across all three pages)
- Optimistic create-template handoff if applicable

Each page becomes a thin caller; three Adapters collapse to one
tested Module. **Locality** wins: the bug pattern lives in exactly
one place; the fix from PR #186 is automatically applied everywhere.

**Blast radius**

Three pages + new hook file + tests. Touch surface ~200 LOC. Existing
page tests catch any regression because the seam tests (#197) cover
the wake-confirm flow's drawer interaction.

**Dependencies / sequencing**

Independent. Land any time.

---

## §B — `effectiveEnd` Module accepts `Settings`, not `napLen`

**Status:** `done` — PR #201. Fixup narrowed the Interface further to `EffectiveEndConfig = Pick<Settings, "defaultNapLengthMinutes">` so `expandPutdown.ts` doesn't need an `as unknown as Settings` cast.

**Files involved**
- `src/v3/lib/effectiveEnd.ts` (the Module)
- `src/v3/ui/renderProjection.ts` (caller, pass 2)
- `src/v3/components/Timeline/expandPutdown.ts` (caller, pass 3)
- `src/app/(signed-in-with-child)/page.tsx` (Dashboard, calls predicate for button visibility)

**Problem**

The Module exposes `effectiveEndOf(event, napLen, now)` and
`isInProgress(event, napLen, now)`. `napLen` is a raw integer that
every caller threads from `settings.defaultNapLengthMinutes`. The
Interface fragments a single concept ("when does this sleep
functionally end given baby's reality") into a positional knob.

Worse: the extension math runs **twice per render** on in-progress
sleeps — `renderProjection` bakes effective end in pass 2 and
`expandPutdown` recomputes it in pass 3.

The Dashboard imports the predicate directly to drive button
visibility, even though the rendered-event array already carries the
answer in its `endTime` field.

**Friction sign**

Three call sites pass the same Settings value positionally. The
double-computation is invisible at any one call site but real in
aggregate. Dashboard reaches into a `lib/` Module to make a render
decision — a coupling-direction smell.

**Deletion test**

Pass — the cycle-count extension logic (cap at 3 extensions =
`startTime + 4 × napLen`) is genuine Domain math, not a wrapper.

**Provisional direction**

Two surfaces:
```ts
resolvedEnd(event: Event, settings: Settings, now: TimeMin): TimeMin
isInProgress(event: Event, settings: Settings, now: TimeMin): boolean
```

Both accept `Settings` (not `napLen`). The Dashboard's button gate
becomes a Selector over the already-projected event array:
`actuals.find(e => e.type === "bedtime" && e.lifecycle.state === "recorded")` —
which is already how it works after PR #197. Confirm no remaining
callers need the raw predicate; if not, drop it.

`renderProjection` and `expandPutdown` should share the baked result
— probably via a second projection pass that writes `event.endTime`
to the resolved value, so pass 3 just reads it.

**Blast radius**

Module + 3 call sites + tests. ~80 LOC. The math is unchanged; only
the Interface widens.

**Dependencies / sequencing**

Independent. Light enough for a Saturday morning.

---

## §C — Split `withV3SettingsDefaults` into defaults vs migrations

**Status:** `done` — PR #203. Fixup made `normalizeSettingsDoc` use `makeDefaultSettings` as its baseline so nested arrays (`wakeWindowsMinutes`, `bottleIntervalRules`, etc.) are fresh per-call — symmetric with the construction seam.

**Files involved**
- `src/v3/firestore/settingsDefaults.ts` (the Module)
- `src/v3/firestore/converters.ts` (read-seam caller)
- `src/app/(signed-in-with-child)/settings/page.tsx` (first-run scaffold caller)

**Problem**

`withV3SettingsDefaults` does two jobs through one Interface:

1. **Build a default Settings from scratch** (used by the settings page when no doc exists)
2. **Promote a legacy doc to current shape** (used by the converter on every read)

Inside the body, four layered concerns: structural defaults, `pumpTimes`
schema migration (`number[]` → `PumpSession[]`), owner-color placeholder
migration, `timelinePxPerHour` heuristic rewrite. Each migration comment
says "removable once no docs carry X" — but the function takes them all
each call.

Migration #4 contains a heuristic guard (`timelineColorMode == null`)
to avoid clobbering intentional choices — encoding PR history in a
defaults function.

**Friction sign**

The settings page imports a "defaults" function but actually runs the
full migration pipeline against its own freshly-constructed scaffold.
Any new migration silently runs on the first-run path too.

**Deletion test**

Asymmetric. Pass for the migrations (delete → callers must handle
partial docs). Fail for the defaults (delete → just inline them).
That asymmetry IS the friction — two operations sharing a body.

**Provisional direction**

Split into two Modules at two Seams:

```ts
// construction seam — pure, no legacy awareness
export function makeDefaultSettings(childId: string): Settings
```

```ts
// Firestore read seam — migrations + defaults composition
export function normalizeSettingsDoc(raw: unknown): Settings
```

The converter calls `normalizeSettingsDoc`. The settings page calls
`makeDefaultSettings`. Internally, `normalizeSettingsDoc` may call
`makeDefaultSettings` for missing fields but doesn't expose that.

**Blast radius**

One module file split into two + caller updates + tests. Existing
`settingsDefaults.test.ts` mostly retargets cleanly.

**Dependencies / sequencing**

Independent. Conflicts with anything touching `Settings` shape — a
parallel session adding a Settings field needs to update both Modules.

---

## §D — Fix render-synthetic filter coupling direction

**Status:** `done` — PR #200

**Files involved**
- `src/v3/selectors.ts` (engine layer)
- `src/v3/components/Dashboard/dashboardStats.ts` (component layer)
- `src/v3/components/Timeline/expandPutdown.ts` (currently owns `PUTDOWN_KIND_TAG`)

**Problem**

Both `selectors.ts` (Domain layer) and `dashboardStats.ts` (component
layer) independently implement "skip synthetic putdown events."
`selectors.ts` defines `isEngineEvent(e)`; `dashboardStats.ts` inlines
the same check.

Worse: `selectors.ts` imports `PUTDOWN_KIND_TAG` from `expandPutdown.ts`
— the Domain layer importing from a component-layer Module is the
coupling direction inverted.

**Friction sign**

Two implementations of one predicate. A future render-only event
class (history overlay, projected daycare block, etc.) would need
filtering in both modules; the maintainer wouldn't know about both.

**Deletion test**

Borderline pass. The guard's logic is one line, but the
"render-synthetic" classification IS a Domain concept (it has callers
in two layers) and deserves an Interface.

**Provisional direction**

Move `PUTDOWN_KIND_TAG` (and any future synthetic-event tags) into
`src/v3/schemas.ts` (or a thin `src/v3/lib/syntheticEvents.ts`).
Export a single `isRenderSynthetic(e: Event): boolean`. Both
`selectors.ts` and `dashboardStats.ts` become callers; component
layer never has a Domain-layer importer.

**Blast radius**

Smallest of the six. ~40 LOC. Mostly an import-rewrite.

**Dependencies / sequencing**

Independent.

---

## §E — Decide-and-prune: dead schemas `TomorrowPlan` + `bottleRules`

**Status:** `pending` — needs Jake's product decision before any code

**Files involved**

`TomorrowPlan` group:
- `src/v3/schemas.ts` (the type)
- `src/v3/repositories/tomorrowPlans.ts` (orphan repo)
- `src/v3/repositories/tomorrowPlans.test.ts` (orphan test)
- `src/v3/components/Dashboard/StartDayButton.tsx` (the hardcoded `hasTomorrowPlan={false}` prop site)

`bottleRules` group:
- `src/v3/schemas.ts` (`BottleAmountRule`, `Settings.bottleRules`)
- `src/v3/firestore/settingsDefaults.ts` (defaulted to `[]`)

**Problem**

Two designed-but-never-wired schema surfaces:

1. **`TomorrowPlan`** has `ownerOverrides`, `extras`, `startTemplateId` —
   none are read by the actual `/tomorrow` page. Owner overrides go
   straight to the `OwnershipTemplate`; extras live in local React
   state and are written directly to events on promote. The
   "auto-promoted when the first wake event is recorded" promise in
   the schema comment has not been implemented.
2. **`Settings.bottleRules`** (V2 amount-by-age rules) is in `DEFAULTS`
   but no engine rule reads it. Only `bottleIntervalRules` was
   actually restored from V2.

The `StartDayButton hasTomorrowPlan={false}` prop is a hardcoded stub.

**Friction sign**

`bottleIntervalRules.ts` carries a comment "silently dropped during
the V3 rewrite; restored 2026-05-11" — that one was a real regression
catch. `bottleRules` has no analogous restoration comment, suggesting
it was deliberately left unimplemented. The `tomorrowPlans` repo
exists, has tests, and zero non-test callers.

**Deletion test**

Fail in the deepening sense — these aren't shallow Modules with
friction; they're dead code creating false confidence about app
capability.

**Provisional direction**

**Decide first**, then either wire or delete.

For each, three options:
- **Wire it** — see "if wiring" below
- **Delete entirely** — schema, repo, tests, stub prop. Smallest.
  Update `DOMAIN.md`/spec docs to reflect the actual flow.
- **Park with a TODO** — explicit "kept for future §F-item, not
  currently consumed" comment. Useful only if the wiring is
  imminent.

If wiring `TomorrowPlan`:
- New engine rule (R4.3?) applies `ownerOverrides` map on day promote
- Splice `extras` into the new day's events on `startNewDay`
- `StartDayButton` reads `hasTomorrowPlan` from a `useTomorrowPlan(date)` hook

If wiring `bottleRules`:
- Settings UI editor row
- Engine rule projects a warning on bottles outside the age-amount band
- OR: passive UX-only, no engine rule (the warning is render-time)

**Blast radius**

Delete: ~100 LOC removed across two trees. Wire: 1–2 PRs each.

**Dependencies / sequencing**

Decision-gated. Worth resolving before another session accidentally
extends one of these.

---

## §F — First-class owner-annotation protocol

**Status:** `pending` — biggest blast radius; deferred until post-deploy unless promoted

**Files involved**
- `src/v3/engine/rules/wakeWindowOverrides.ts` (R4.2)
- `src/v3/engine/rules/naps.ts` (R3.1 match predicate)
- `src/v3/engine/evaluator.ts` (`checkRealityWins` carve-out)
- `src/v3/schemas.ts` (Event shape)
- `src/v3/repositories/events.ts` (currently the storage seam)
- `src/app/(signed-in-with-child)/timeline/page.tsx` (`recorded_${eventKey}` re-ID dance)

**Problem**

Owner-only annotations are stored as `Event { type: "wake_window",
lifecycle.state: "recorded" }` — a recorded event whose only payload
is the owner. This is a Domain concept ("owner annotation") implemented
as a Firestore-shape pun.

The pun forces carve-outs at three Seams:
- `checkRealityWins` explicitly excludes wake_windows
- R3.1's `matches` ignores recorded wake_windows
- R4.2's `assertAfter` invariant pins the cascade against survivors

**Friction sign**

Three independent code comments apologizing for the same pun. The
"metadata carrier" concept is NOT in `DOMAIN.md` and NOT in any
TypeScript type — it emerges from rule interactions. Tests for any
one rule pass; the protocol's correctness is only verified by the
end-of-cascade invariant check.

**Deletion test**

Pass — the Domain capability (annotate a wake window with an owner
without claiming it happened) is real and useful; concentrating its
implementation eliminates the three-Seam carve-out tax.

**Provisional direction**

First-class type the concept. Two shapes worth grilling:

**Option F.1** — discriminator field on Event
```ts
type Event = (... existing types ...) & { recordingClass: "actual" | "annotation" }
```
Annotation events skip the reality-wins guard automatically; the
engine collects annotations into a `Map<eventKey, OwnerRef>` once,
and cascade rules consult that map.

**Option F.2** — separate Firestore tree
```
/children/{childId}/days/{dayId}/annotations/{eventKey}
```
Annotations live outside the events tree entirely. Stronger Seam.
Worse migration story (existing annotation docs are in
`/events/{id}`).

Either way: R4.2 becomes "apply annotations to projected outputs";
the evaluator guard goes away; the timeline `recorded_${eventKey}`
re-ID dance simplifies.

**Blast radius**

Largest of the six. Schema migration, three engine rules, repository
shape, write-path on timeline + day-templates, plus a
`Contaminated data` section in the PR per workspace convention.

**Dependencies / sequencing**

Probably **not pre-deploy**. The carve-outs all have tests and have
been stable for ~weeks. Park this as a post-deploy item OR a
deliberate pre-deploy investment if Jake wants to ship a cleaner
foundation.

---

## Excluded but flagged

These came up in the exploration but are feature-debt rather than
deepening candidates.

### `DailyRecurring.defaultOwnerSlot` typed `OwnerSlot` not `OwnerRef`

**Status:** `excluded` — additive schema widening, not depth

`DailyRecurring.defaultOwnerSlot` and `Settings.pumpOwnerSlot` are
typed `OwnerSlot | undefined` (`parent1 | parent2 | undefined`). The
spec contemplates `other` caregivers as default owners — supported by
`OwnerRef` already (which has `{ slot: "other"; otherId: string }`).
Rule files have tracking comments.

This is a one-line widening when someone wants it. File as `§F45` or
similar in `FAST_FOLLOW.md`, not architecture work.

### Multiple inline `useState` for sheet/picker open-state

**Status:** `excluded` — subsumed by §A

Dashboard currently has `useState` for `pickerOpen`, `drawer`, and
`wakeSheetOpen`. Timeline has the same triplet. If §A ships, the
`useDrawer` hook absorbs `drawer`, and the others can fold into it
naturally. Not worth a separate item.

---

## Suggested fan-out

Three sessions could run in parallel without stepping on each other:

| Session | Candidate | Why parallel-safe |
|---|---|---|
| 1 | §A `useDrawer` | Touches three pages; no other candidate touches `DrawerState` |
| 2 | §B `effectiveEnd` | Touches `lib/`, `ui/`, and one page hook line; no overlap with §A's hook |
| 3 | §D synthetic-filter | Pure import-rewrite; isolated to two files |

§C and §F should be solo (§C touches converters, which any Settings
schema change touches; §F is too big).

§E is a product decision, not a code task.
