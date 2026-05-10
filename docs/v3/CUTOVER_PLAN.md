# V2 → V3 Full Cutover Plan v4 (FINAL)

> **Status**: ratified after 3 adversarial review cycles (47 issues
> surfaced, 45 actionable, all addressed). Ready to execute.
>
> **Authors / reviewers**: drafted with Explore + code-reviewer
> subagents over 2026-05-09 dogfooding session.
>
> **Mandate**: cut every authed route over to V3 hooks + V3 components
> + V3 Firestore shape. End state: zero V2 code in `src/`, zero V2
> vestiges in V3 code, every defensive shim deleted in PR-C1.

---

## North star

End state:
- Zero V2 code in `src/`
- Zero V2 vestiges in V3 code (no `if input.startTime is string`
  branches, no parent1 fallback for legacy strings, no flat-vs-nested
  settings handling, no `templateId ?? ownershipTemplateId` remap)
- Every defensive shim that exists today to bridge V2/V3 deleted in
  PR-C1
- TypeScript proves wiring at every boundary

---

## Architectural commitments

1. **Single source of truth.** All consumers import from `@/v3/schemas`.
   No type re-declaration.
2. **Conversion only at boundaries.** Firestore I/O converts shape;
   engine + UI work on V3 types end-to-end. No `as Event` casts in
   pages.
3. **TimeMin only in V3 surfaces.** `parseTime`/`formatTime` from
   `@/domain` never imported in V3 code. Only `formatHM24`,
   `parseHM24`, `formatTimeForDisplay`, `formatTimeShort` from
   `@/v3/ui/time`.
4. **OwnerRef only in V3 surfaces.** All owner UI through
   `OwnerPickerV3`.
5. **Lifecycle dispatch in one place.** `formToEvent.ts` is the sole
   source.
6. **`Day.wakeTime = TimeMin | undefined`.** Use `=== undefined`,
   never truthy (TimeMin 0 is falsy).
7. **Pre-push gate non-negotiable.** typecheck → lint → format:check →
   unit → integration.
8. **TDD discipline.** RED → GREEN → REFACTOR; code-simplifier on
   GREEN ≥ 10 lines; code-reviewer before PR open.
9. **No `Date.now()` for IDs.** `newEventId(prefix)` from
   `@/v3/lib/newEventId` everywhere.

---

## V2 vestiges catalog (all targeted for deletion in PR-C1)

### Files to delete entirely

- `src/domain/` (entire directory: types.ts, time.ts, project.ts,
  selectors.ts, napChain.ts, napActuals.ts, bedtime.ts, putdown.ts,
  owners.ts, wakeWindowOverrides.ts, dreamFeed.ts, bottleRules.ts,
  bottleChain.ts, bottleOverlap.ts, bottleSuppress.ts, extras.ts,
  index.ts, all `*.test.ts`, `__fixtures__/`)
- `src/hooks/use{Day,Events,Settings,Templates}.{ts,test.tsx}`
- `src/repositories/` (entire: days.ts, events.ts, settings.ts,
  templates.ts, startNewDay.ts, all `*.test.ts`)
- `src/lib/firestore/converters.ts` (V2)
- `src/lib/defaults/settings.ts`
- `src/components/Timeline/{TimelineV2,Block,InstantChip,InstantCluster,NowBar}.{tsx,module.css,test.tsx}`,
  `groupInstants.{ts,test.ts}`
- `src/components/Settings/*.tsx` (V2 editors). `SettingsAccount.tsx`
  migrates to `src/v3/components/shared/SettingsAccount.tsx` in PR-C1.
- `src/components/Dashboard/*` (all)
- `src/components/Tomorrow/*` (all)
- `src/components/History/*` (all)
- `src/components/DayTemplates/*` (all)
- `src/components/shared/{EventEditDrawer,createEventTemplate,OwnerPicker}.{tsx,ts,module.css,test.tsx}`
- `src/v3/firestore/v2Backcompat.{ts,test.ts}` (entire shim file)

### Code-level wipes within retained files

**`src/v3/firestore/eventDefaults.ts`:**
- Drop `asTimeMin` string-handling branch (only TimeMin numbers
  post-cleanup)
- Drop `deriveLifecycle` legacy V2 source/status/recorded handling
  (input becomes V3-shape)
- Drop `deriveOwner` free-string V2 owner branch + parent1 fallback
- Drop `deriveKind` derived-from-V2-type fallback
- Tighten input type from `Event | V2EventLike` to `Partial<Event>`
- Function becomes pure defaults filler for partial V3 docs (still
  useful)
- Test cases: drop 6 V2-shape tests; keep 2 V3 tests; add round-trip
  test

**`src/v3/firestore/dayDefaults.ts`:**
- Drop `templateId ?? input.ownershipTemplateId` field-rename remap
- Function becomes pure defaults filler (suppression fields stay —
  legitimate optionality)

**`src/v3/firestore/settingsDefaults.ts`:**
- **NO CHANGES** (file is already V3-only; V2 bridging is in
  `v2Backcompat.ts` only)

**`src/v3/hooks/useV3Events.ts`:**
- Drop V2-shape handling branch in `withV3EventDefaults` application
- Keep `withV3EventDefaults` as defensive defaults filler (V3-only
  input)

**`src/v3/hooks/useV3Settings.ts`:**
- Drop V2-shape handling but keep defaults filling

**`src/v3/hooks/useV3Day.ts`:**
- Drop `withV3DayDefaults` V2-shape handling; keep defaults filling

### `firestore.rules` wipes

- `events.create.startTime`: tighten from `is int OR isString` to
  `is int` only

### Memory + docs

- Update `v3_strategy.md` to reflect cutover complete
- (Optional) update `feedback_v3_tdd.md` if cutover-finished marker
  desired

---

## Phase A0 — Foundation fixes

These PRs land first; they fix critical issues surfaced by the 3
adversarial reviews and unblock the page swaps.

### PR-A0.1 — `withV3DayDefaults` at converter level

- New `src/v3/firestore/dayDefaults.ts` with
  `withV3DayDefaults(input: Partial<Day> | null): Day | null`
- Fills: `suppressedRecurringIds: []`, `suppressedDaycareDay: false`
- Remaps: `templateId ?? input.ownershipTemplateId` (handles V2 docs
  and pre-cutover V3 docs)
- Apply in **`v3DayConverter.fromFirestore`** (replace passthrough —
  covers `getDay`, `getDayByDate`, `listArchivedDays`,
  `watchActiveDay` all via converter); also in `useV3Day` (idempotent —
  both apply, no double-fill risk)
- Tests: 11 unit tests including round-trip
  `fromFirestore(toFirestore(day))` equality

### PR-A0.2 — V3 `startNewDay` (simpler approach, no singleton)

- Extend `src/v3/repositories/days.ts`:
  ```ts
  export type StartNewDayInput = {
    newDayId: string;
    newDate: string;
    newWakeTime: TimeMin;
    templateId?: string;
  };
  export async function startNewDay(db, childId, input): Promise<void>
  ```
- Behavior: query active day, archive (`status="archived"`), then
  `setDoc` the new day. **NOT a transaction** — Firestore can't run
  collection queries inside transactions, and a singleton-state
  collection adds rules complexity. Race documented as acceptable for
  single-family app (worst case: brief overlap, watcher resolves to
  most recent).
- V3 day write: `wakeTime` as TimeMin number, no `archivedAt`, no
  `createdAt`, includes `suppressedRecurringIds: []`,
  `suppressedDaycareDay: false`
- Integration test: assert wakeTime is number, templateId field
  correct, no archivedAt/createdAt, archive→create sequence
- ARCHITECTURE_V3.md note: "startNewDay is non-atomic by design;
  race is acceptable in single-family deployment"
- **No `firestore.rules` changes needed** (no singleton)

### PR-A0.3 — V3 `setOwnerInTemplate`

- New file `src/v3/components/DayTemplates/setOwnerInTemplate.{ts,test.ts}`
- Signature:
  `setOwnerInTemplate(template: OwnershipTemplate, event: Event, owner: OwnerRef | undefined): OwnershipTemplate`
- Branches on `event.eventKey` regex: `nap_N`, `wake_window_N`,
  `bottle_N`, `bedtime`
- Tests: 8 unit tests (each event-key path + clear + invalid eventKey
  no-op)

### PR-A0.4 — Drawer save logic refinement (atomic with timeline page update)

- Replace `isRecorded(drawer.event.lifecycle)` with
  `actuals.some(a => a.id === drawer.event.id)` in timeline page
  drawer onSave
- **Engine R0 verification (sub-step)**: confirm V3 evaluator
  suppresses projected events when an overridden actual exists for
  the same eventKey. If not, add the rule first as PR-A0.4a. The
  current reality-wins guard handles this for `started`/`completed`
  (`isRecorded`). For `overridden`, a separate dedup pass may be
  needed. Verify with a unit test in PR-A0.4a if necessary.
- Update timeline page in same PR (atomic — no divergence between
  Timeline and planned Dashboard/Tomorrow)
- Tests in `EventEditDrawerV3.test.tsx`: **fixture must put the
  overridden event with the same id in both `actuals` and
  `drawer.event`** so the test exercises the real flow
- Update `v3_strategy.md` memory entry with new save-flow rule

### PR-A0.5 — Duplicate (NOT move) shared CSS modules into V3

- Copy V2 CSS module files into V3 component dirs (preserve V2 imports
  for V2 components):
  - `src/components/Timeline/{TimelineV2,Block,InstantChip,InstantCluster,NowBar}.module.css`
    → `src/v3/components/Timeline/`
  - `src/components/shared/{EventEditDrawer,OwnerPicker,FAB,FABTypePicker,ConfirmDialog}.module.css`
    → `src/v3/components/shared/`
- Update V3 component imports to point to V3 paths
- V2 components keep their original CSS imports unchanged
- Pre-push gate must pass

### PR-A0.6 — Owner-aware `useV3Events` (with timeline page update)

- Refactor `withV3EventDefaults(input, owners?)` — when owners
  supplied, look up V2 string owner against
  `owners.parent1.displayName / parent2.displayName / other[].displayName`.
  Match → correct slot ref. No match or no owners → parent1 fallback.
- `useV3Events(childId, dayId, owners?)` accepts optional
  `owners?: OwnersConfig`. Backfill happens INSIDE the hook.
- **Update timeline page in same PR**: pass
  `owners={settings?.owners}` to `useV3Events`
- Tests: 5 new cases on `withV3EventDefaults` (V2 string + matching
  displayName → correct slot; non-matching → parent1)

### PR-A0.7 — `withV2TemplateBackcompat` shim

- New function in `src/v3/firestore/v2Backcompat.ts`:
  `withV2TemplateBackcompat(input)` — remaps V3 `displayName` → V2
  `label` for V2 useTemplates read path
- Wire into V2 useTemplates:
  `setTemplates(tt.map(withV2TemplateBackcompat))`
- V3 saveTemplate path unchanged (writes V3 displayName)
- Tests: 4 unit tests
- **Cleanup target (PR-C1)**: deletes with `v2Backcompat.ts`

### PR-A0.8 — `withV2DayBackcompat` shim

- New function in `src/v3/firestore/v2Backcompat.ts`:
  `withV2DayBackcompat(input)` — converts V3 day → V2 shape:
  - `wakeTime: TimeMin` → `wakeTime: HHMMString | undefined` via
    formatHM24
  - `templateId` → `ownershipTemplateId`
  - synthesize `createdAt` from `day.date` if missing
- Wire into V2 useDay: `setDay(withV2DayBackcompat(d))`
- Tests: 5 unit tests
- **Cleanup target (PR-C1)**: deletes with `v2Backcompat.ts`

### PR-A0.9 — Collision-safe `newEventId` utility

- New file `src/v3/lib/newEventId.{ts,test.ts}`
- Signature: `newEventId(prefix: string): string` — uses
  `crypto.randomUUID()`
- Update **all** V3 call sites:
  - `src/v3/components/shared/createEventTemplate.ts` (4 templates)
  - `src/app/(authed)/timeline/page.tsx` drawer onSave (the
    `manual-${Date.now()}` line)
  - `src/v3/components/Settings/OwnersConfigEditor.tsx` (the
    `other_${Date.now()}` line)
  - planned Dashboard/Tomorrow drawer onSave call sites in PR-B2/B3
- Tests: 3 unit tests + grep audit confirms no `Date.now()` in any V3
  id-generation path

### PR-A0.10 — Shared placeholder constants

- New file `src/v3/hooks/projectionPlaceholders.{ts,test.ts}` exporting
  `PLACEHOLDER_DAY: Day` and `PLACEHOLDER_SETTINGS: Settings`
- Strict types from `@/v3/schemas` so schema additions break
  compilation here
- **Update timeline page (PR #60 already merged) in same PR** to
  import from this module
- Long-term TODO comment in the module: "make `useV3Projection`
  handle null day/settings internally"
- Tests: type-check only

---

## Phase A — V3 primitives (each TDD'd)

### PR-A1 — V3 selectors (`src/v3/selectors.{ts,test.ts}`)

- Functions: `nextEvent`, `nextBottle`, `nextNap`,
  `currentWakeWindow`, `projectedBedtime`
- All take `Event[]` from V3 + `TimeMin nowMinutes`
- `projectedBedtime` returns `Event | undefined` (NOT string — keeps
  all time as TimeMin)
- Tests: 18 unit tests including ties, all-past, multi-bedtime,
  nowMinutes exact equality

### PR-A2 — V3 dashboard cards (`src/v3/components/Dashboard/`)

8 card files + tests:
- `NextEventCard`
- `NextBottlePreview`
- `NextNapPreview`
- `CurrentWakeWindowStatus`
- `NapActionButton`
- `StartBottleButton`
- `StartDayButton`
- `EndOfDayCard`

Notes:
- `StartBottleButton`: emits Event with `completed` lifecycle; id from
  `newEventId("bottle")`
- `NapActionButton`: Start emits `started` lifecycle; End calls
  `updateOptimistic` on existing started nap (NOT `createOptimistic` —
  fixes V2 bug)
- `StartDayButton`: callback receives intent; page wires `startNewDay`
- `EndOfDayCard`: takes onStart callback wired to V3 `startNewDay`
- Per-card hand-test plan in PR body

### PR-A3 — V3 history views (`src/v3/components/History/`)

- `HistoryList`, `HistoryDayCard`, `ArchivedDayView` using TimelineV3
- Take `OwnersConfig` prop for owner display

### PR-A4 — V3 DayTemplates pieces (`src/v3/components/DayTemplates/`)

- `TemplateOwnerPicker` (uses `OwnerPickerV3`)
- `setOwnerInTemplate` covered in PR-A0.3

### PR-A5 — V3 Tomorrow pieces (`src/v3/components/Tomorrow/`)

- `TomorrowForm`, `TomorrowPreview` (uses V3 projectDay + TimelineV3),
  `PromoteTomorrowButton`

---

## Phase B — page swaps

V2 component files + tests retained until PR-C1 for revertibility.
Each Phase B PR rewrites one page to V3.

### PR-B1 — AppShell V3 (`src/components/shared/AppShell.tsx`)

- **Hard prerequisite: PR-A0.8 merged.** PR description states
  "Requires A0.8 merged"
- Swap `useDay → useV3Day`
- Header reads `day.date` (string, unchanged)
- Pre-merge grep: `grep -r 'from "@/hooks/useDay"' src/` returns only
  AppShell (or empty after PR)
- Hand-test: app loads on every route, header shows correct date

### PR-B2 — Dashboard V3 (`src/app/(authed)/page.tsx`)

- Hooks: `useV3Day`, `useV3Events` (with `owners={settings?.owners}`),
  `useV3Settings`, `useV3Templates`, `useV3Projection`
- Selectors: from `@/v3/selectors`
- Components: from `@/v3/components/Dashboard/*`
- Drawer: `EventEditDrawerV3` + V3 `createEventTemplate`; save logic
  uses `actuals.some(a => a.id === drawer.event.id)` from PR-A0.4
- StartNewDay: V3 from PR-A0.2
- Wake gate: `!day || !settings || day.wakeTime === undefined` (NOT
  truthy)
- Bedtime check: `nowMinutes >= settings.bedtimeThreshold` (TimeMin
  direct, no parseTime)
- `uniqueRecordedKeys`: filter `isRecorded(e.lifecycle)`, count
  distinct eventKey
- `lastEventOfType`: filter `isRecorded(e.lifecycle)`, sort by
  startTime numerically
- Placeholders: import from `@/v3/hooks/projectionPlaceholders`
- `updateOptimistic` dayId guard: short-circuit if `dayId === ""`

**Hand-test plan (concrete steps):**
1. Load Dashboard with no active day → see EndOfDayCard with "Start
   Day"
2. Tap Start Day → new day created (Firestore: V3 shape, wakeTime as
   int, no archivedAt)
3. Dashboard renders normal view with empty preview cards
4. Tap Start Bottle → bottle 1 with completed lifecycle, ordinal
   "Bottle 1"
5. Tap Start Bottle again → bottle 2
6. Tap Start Nap → nap 1 with started lifecycle; button → "End Nap"
7. Tap End Nap → nap 1 completes (same Firestore doc updated,
   `lifecycle.state="completed"`)
8. Tap FAB → Bottle → drawer; save creates Bottle 3
9. Edit projected future bottle → owner picker → save → creates new
   override with collision-safe id
10. Re-edit same overridden event → save → updates same doc (no
    duplicate)
11. Verify preview cards reflect bottle/nap/wake-window/bedtime
    correctly
12. Verify NextEventCard for upcoming dream feed (if dreamFeedEnabled)
13. Verify after `settings.bedtimeThreshold` → end-of-day card appears

### PR-B3 — Tomorrow V3 (`src/app/(authed)/tomorrow/page.tsx`)

- Hooks: `useV3Settings`, `useV3Templates`
- **Preserve `templateOverride` local state pattern.** PR body notes:
  template list is one-shot fetch; show loading until
  `loading === false`
- Form: V3 `TomorrowForm` (PR-A5)
- Preview: V3 `TomorrowPreview` (PR-A5)
- Drawer for extras: `EventEditDrawerV3` + V3 `createEventTemplate`;
  same save logic as B2
- `TemplateOwnerPicker` + `setOwnerInTemplate` from V3 (PR-A4, A0.3)
- `saveTemplate` from V3 repo
- Hand-test: select template, edit nap owner, see preview update;
  promote tomorrow → new day created via V3 `startNewDay`

### PR-B4 — History V3 (`src/app/(authed)/history/page.tsx + [date]/page.tsx`)

- Hooks: `useV3Day`, `useV3Events` (with owners), `useV3Settings`
- Components: from `@/v3/components/History/*`
- Hand-test: list shows last 7 archived days; click into one shows
  TimelineV3

### PR-B5 — DayTemplates V3 (`src/app/(authed)/day-templates/page.tsx`)

- Hooks: `useV3Settings`, `useV3Templates`
- TimelineV3 for preview
- `TemplateOwnerPicker`, `setOwnerInTemplate` from V3
- `saveTemplate` from V3 repo
- Hand-test: edit Saturday template owners, save, verify V3 doc in
  Firestore (`displayName` field)

---

## Phase C — CLEAN WIPE (PR-C1)

### Pre-merge audits (must all return EMPTY)

```bash
grep -rn 'from "@/domain"' src/
grep -rn 'from "@/hooks/use\(Day\|Events\|Settings\|Templates\)"' src/
grep -rn 'from "@/repositories/' src/
grep -rn 'from "@/lib/firestore/converters"' src/
grep -rn 'from "@/lib/defaults/settings"' src/
grep -rn 'from "@/components/Timeline/TimelineV2"' src/
grep -rn 'from "@/components/shared/EventEditDrawer\b"' src/
grep -rn 'from "@/components/shared/OwnerPicker\b"' src/
grep -rn 'from "@/components/shared/createEventTemplate"' src/
grep -rn 'from "@/components/Dashboard/' src/
grep -rn 'from "@/components/Tomorrow/' src/
grep -rn 'from "@/components/History/' src/
grep -rn 'from "@/components/DayTemplates/' src/
# V3 must not import V2 CSS:
grep -rn 'from "@/components/Timeline.*\.module\.css"' src/v3/
grep -rn 'from "@/components/shared.*\.module\.css"' src/v3/
# No Date.now() IDs left in V3:
grep -rn 'Date\.now()' src/v3/ | grep -v 'test\|spec\|lastSyncedAt\|setNow\|setInterval'
```

### Files deleted (alphabetized)

- `src/components/Dashboard/*`
- `src/components/DayTemplates/*`
- `src/components/History/*`
- `src/components/Settings/*` EXCEPT `SettingsAccount.tsx` (which
  moves to `src/v3/components/shared/SettingsAccount.tsx` in this PR;
  update Settings page import)
- `src/components/Timeline/*` (V2: TimelineV2, Block, InstantChip,
  InstantCluster, NowBar — `.tsx`, `.module.css`, `.test.tsx`,
  `groupInstants.{ts,test.ts}`)
- `src/components/Tomorrow/*`
- `src/components/shared/EventEditDrawer.{tsx,test.tsx,module.css}`
- `src/components/shared/OwnerPicker.{tsx,test.tsx,module.css}`
- `src/components/shared/createEventTemplate.{ts,test.tsx}`
- `src/domain/` (entire directory)
- `src/hooks/use{Day,Events,Settings,Templates}.{ts,test.tsx}`
- `src/lib/defaults/settings.ts`
- `src/lib/firestore/converters.ts`
- `src/repositories/` (entire directory)
- `src/v3/firestore/v2Backcompat.{ts,test.ts}`

### Code-level wipes within retained files

- `src/v3/firestore/eventDefaults.ts`: drop V2 string-time, V2
  source/status/recorded, V2 string-owner + parent1 fallback,
  V2-derived kind branches. Tighten input type. Update tests (drop 6
  V2 cases, keep 2 V3, add round-trip).
- `src/v3/firestore/dayDefaults.ts`: drop
  `templateId ?? input.ownershipTemplateId` remap.
- `src/v3/hooks/useV3Day.ts`: clean V2-shape handling out of
  `withV3DayDefaults` application.
- **NO CHANGES to `src/v3/firestore/settingsDefaults.ts`** (file is
  already V3-only).

### `firestore.rules`

- Tighten `events.create.startTime` from `is int OR isString` to
  `is int` only.

### Hand-test

All routes (Dashboard, Tomorrow, History, Day Templates, Settings,
Timeline). Verify V3-shape Firestore writes succeed; verify V2-shape
writes fail (rules reject).

---

## TypeScript-driven verification (per PR)

- `pnpm typecheck`: NO `any`, NO `as` casts at component boundaries
- End-to-end type trace per page (page → child prop type → field
  reads → format helpers)
- Grep audit (per Phase B PR): no `from "@/domain"` introduced
- No type re-declaration; only re-exports from `@/v3/schemas`

---

## Risks + mitigations (final, post-3-reviews)

| # | Risk | Mitigation | Source |
|---|------|------------|--------|
| 1 | Time format leakage | V3 surfaces import only from `@/v3/ui/time`; grep audit per PR | committed |
| 2 | Owner refs lost | Owners-aware `useV3Events` (PR-A0.6); legacy data backfilled | R1#8, R2#7 |
| 3 | Lifecycle dispatch divergence | `formToEvent` sole source; PR-A0.4 unifies Timeline + planned pages atomically | R1#4, R2#3 |
| 4 | Settings shape leftover | V3 settings page writes V3; defaulter + cleanup | committed |
| 5 | Day.wakeTime semantics | startNewDay writes immediately; checks use `=== undefined` | R1#3 |
| 6 | Event.kind | V3 createEventTemplate sets correctly | committed |
| 7 | Day.suppressed* missing | `withV3DayDefaults` at converter level (PR-A0.1) | R1#22 |
| 8 | templateId vs ownershipTemplateId | dayDefaults remaps for V3 reads; V2 day backcompat for V2 reads of V3 docs | R1#1 |
| 9 | createdAt missing | V2 day backcompat synthesizes from `day.date` | R1#13 |
| 10 | Re-edit overridden duplicates | Drawer save uses `actuals.some(...)` (PR-A0.4); test fixture uses same id | R1#4, R3#1 |
| 11 | CSS deletion order | Duplicate not move; pre-merge audit verifies V3 not importing V2 CSS | R2#1, R3#3 |
| 12 | `setOwnerInTemplate` missing | Built ahead of consumers (PR-A0.3) | R1#7 |
| 13 | Templates non-subscribing | `templateOverride` pattern preserved in PR-B3 | R2#14 |
| 14 | `updateOptimistic` empty dayId | Page guards before calling | R2#11 |
| 15 | parseTime in V3 surfaces | Direct TimeMin comparisons; commitment #3 | R1#14 |
| 16 | `firestore.rules` tighten timing | Only after Phase B complete (PR-C1) | R1#15 |
| 17 | ID collisions | `newEventId` utility (PR-A0.9) covers all V3 sites including OwnersConfigEditor | R2#6, R3#2 |
| 18 | Owner backfill scope | Inside `useV3Events` hook (PR-A0.6) — covers all reads | R2#7, R3#7 |
| 19 | Template field rename | V2 backcompat (PR-A0.7) for V2 reads | R2#4 |
| 20 | V3 day fields read by V2 hook | V2 day backcompat (PR-A0.8) | R2#5 |
| 21 | startNewDay TOCTOU | Documented as acceptable for single-family app; non-transactional | R2#16 |
| 22 | Phase B test deletion timing | Deferred to PR-C1 for revertibility | R2#13 |
| 23 | wakeTime semantic conflict | Transitional decision: startNewDay sets immediately; **TODO ticket** for proper End-Bedtime → next-day-wake linkage post-cutover | R3#9 |
| 24 | Engine R0 reality-wins coverage | PR-A0.4 verifies engine suppresses projected events when overridden actual exists; adds rule if missing | R3#1 |
| 25 | Singleton state collection | Avoided entirely by simpler startNewDay (no rules update needed) | R3#4 |
| 26 | Converter round-trip | PR-A0.1 includes round-trip test | R3#5 |

---

## What's NOT in this plan

- No new features
- No design changes (V3 reuses V2-styled CSS modules duplicated to V3
  paths)
- No engine changes except possibly R0 verification in PR-A0.4
- No Firestore data migration script (defaulters + backcompat shims
  handle leftovers; cleanup deletes the bridges once docs are
  uniformly V3)
- **End-Bedtime → next-day-wake auto-linkage**: out of scope;
  transitional `startNewDay` writes wakeTime immediately. Filed as
  follow-up TODO.

---

## Rollback / safety

- Phase A0 + A PRs are additive (new files); revertible
- Phase B PRs swap one page; V2 components remain alongside;
  revertible by reverting the PR
- PR-C1 is the irrevocable wipe; lands only after all of Phase B
  stable + dogfooded

---

## Total scope

- 16 Phase A0/A PRs (foundation + primitives)
- 5 Phase B PRs (page swaps)
- 1 Phase C PR (clean wipe)
- **22 PRs total**

---

## Confidence

After 3 review cycles surfacing 47 issues (45 actionable, all
addressed):

- **Critical issues**: all addressed via Phase A0 prerequisites
- **Important issues**: all addressed
- **Wipe completeness**: 14 deletion targets + 5 code-level wipes +
  16 pre-merge audits
- **TypeScript verification**: end-to-end at every PR

Plan v4 is ready to execute.
