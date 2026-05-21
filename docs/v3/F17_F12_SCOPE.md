# §F17 + §F12 — Auto-promote on calendar rollover

Lightweight blueprint for landing the bundled "retire StartDayButton + persist + auto-promote TomorrowPlan" work. Output of `/grill-me` on 2026-05-20 with Jake.

This doc is the spec. If we discover during implementation that the scope is wrong, we update this doc, not the code-to-be-written.

---

## §1 Why bundle F17 and F12

The two fast-follows are inseparable:
- **F17** retires the manual `StartDayButton` ritual by auto-creating the Day on calendar rollover.
- **F12** persists the `/tomorrow` plan and uses it on promotion.

Auto-promote without persistence does nothing useful (it would only ever use defaults). Persistence without auto-promote ships a draft state nobody promotes. They land together.

Pre-deploy gating: **without F17, prod users literally cannot start a day** — the existing `StartDayButton` is `NODE_ENV === "development"` gated.

---

## §2 Decided product behavior

| # | Decision |
|---|---|
| 1 | **Trigger** — calendar-rollover, time-based (not first-event) |
| 2 | **Location** — client-side, runs on every dashboard mount |
| 3 | **Lifecycle** — `TomorrowPlan` has `status: "draft" \| "confirmed"`; only confirmed plans auto-promote |
| 4 | **Edit-revert** — any edit on a confirmed plan reverts it to draft; user must re-confirm |
| 5 | **Clear** — explicit "Clear plan" button always available; deletes the plan doc |
| 6 | **Dashboard hint** — no banner; a notification dot on the Tomorrow bottom-tab indicates an unconfirmed draft |
| 7 | **Stale-day rollover** — archive prior active day; create only today (no backfill for missed days) |
| 8 | **Stale-plan rollover** — if `plan.date < today`, delete it and promote today from settings defaults |
| 9 | **Concurrent rollover** — deterministic `day-${childId}-${date}` id; idempotent `setDoc` transaction makes second writer a no-op |
| 10 | **Dev StartDayButton** — stays `NODE_ENV === "development"` gated; tap → confirm dialog → archive today + re-promote (from confirmed plan if any, else defaults) |
| 11 | **Onboarding handoff** — final wizard step renders projected day preview; tap-to-assign owner picker on each chip with explicit Skip; "Start tracking" commits Day 1 directly without persisting a TomorrowPlan |
| 12 | **/tomorrow display** — same editable form in all three states; status pill at top: "No plan yet" / "Draft" / "Confirmed — will auto-apply at midnight" |

---

## §3 Schema changes

### TomorrowPlan (extend)

```ts
export type TomorrowPlan = {
  childId: string;
  date: string;                // unchanged
  wakeTime?: TimeMin;          // NEW
  status: "draft" | "confirmed"; // NEW
  confirmedAt?: TimeMin;       // NEW (for telemetry / re-confirm logic)
  ownerOverrides: Record<string, OwnerRef | null>; // unchanged
  extras: Event[];             // unchanged
  startTemplateId?: string;    // unchanged
};
```

### Day (extend)

```ts
export type Day = {
  // ... existing fields ...
  ownerOverrides?: Record<string, OwnerRef | null>; // NEW — carries from promoted TomorrowPlan
};
```

No migration needed for either — no V3 prod data exists; emulator state can be cleared if needed.

---

## §4 Engine plumbing

One new rule (in the R3.x family — projection-time):

> **R3.x — Apply Day.ownerOverrides to projected events**
> For each projected event `e` where `day.ownerOverrides?.[e.eventKey]` is defined, set `e.owner` to that value. `null` in the map means explicit `NO_OWNER`. Recorded events are untouched (reality-wins).

No changes to evaluator core. Rule reads `ctx.day.ownerOverrides` and rewrites `e.owner` on matching projected events.

---

## §5 Repo changes

### `src/v3/repositories/days.ts`

- `startNewDay`: change ID minting from `day-${date}-${Date.now()}` to deterministic `day-${childId}-${date}`. Existing `getOrCreatePlannedDay` already uses the date-only id pattern internally — this aligns. Transaction now uses `setDoc` (idempotent overwrite of identical Day shape) instead of `setDoc` with a unique-per-call id.
- New helper: `promoteFromPlan(db, childId, plan: TomorrowPlan, date)` → applies the plan to a new Day doc using the deterministic id, copies `ownerOverrides`, writes `extras` as projected events.

### `src/v3/repositories/tomorrowPlans.ts`

- `confirmTomorrowPlan(db, childId, date, confirmedAt)` and `markPlanDraft(db, childId, date)` helpers for the draft↔confirmed lifecycle.
- `deleteTomorrowPlan` already exists; reused for Clear and for stale-plan GC.

---

## §6 Hook changes

### `src/v3/hooks/useEnsureTodaysDay` (NEW)

Runs on every dashboard mount. Logic:

1. Resolve `today` via `currentLocalDateString()` (matches existing `tomorrowDateString` convention).
2. Read the current active day via existing `watchActiveDay` (already subscribed).
3. If `active?.date === today` → no-op.
4. If `active?.date < today` OR `active === null` → enter promote flow:
   - Load `TomorrowPlan` for `today` from the repo.
   - If `plan?.status === "confirmed"` → call `promoteFromPlan(plan)`.
   - Else → call existing `startNewDay` path with `settings.defaultWakeTime`.
   - Plus: best-effort `deleteTomorrowPlan` for any stale (`plan.date < today`) plans found.

All writes happen in a Firestore transaction. The deterministic `day-${childId}-${date}` id keeps it idempotent under concurrent dashboard opens.

### `src/v3/hooks/useV3TomorrowDraftCount` (NEW)

Lightweight subscription that returns 1 when there's any unconfirmed `TomorrowPlan` for a future date, 0 otherwise. Consumed by `BottomTabs` to show the dot.

---

## §7 UI changes

### `/tomorrow` page

- Autosave on every form change (debounced ~250ms; writes draft `TomorrowPlan` to Firestore).
- Top status pill: `"No plan yet"` / `"Draft"` / `"Confirmed — will auto-apply at midnight"`.
- Bottom-row buttons: `[ Clear plan ]` (always) + `[ Confirm plan ]` (enabled when state ≠ confirmed and form differs from settings defaults).
- Any edit when status === "confirmed" auto-reverts to "draft" with an inline nudge: "Changes detected — re-confirm to keep auto-promote."

### `BottomTabs`

- Tomorrow tab shows a small notification dot when `useV3TomorrowDraftCount() > 0`. CSS-only; uses `--color-accent` or `--color-warning` (TBD at implementation).

### Onboarding final step (NEW)

- New "First day preview" wizard step before the existing "Done."
- Renders `TomorrowPreview` (existing component) dated as today, against `settings.defaultWakeTime`.
- Each projected chip has an inline owner picker with explicit Skip.
- "Start tracking" commits Day 1 directly via `promoteFromPlan(synthesized-plan-from-wizard-state)`. No TomorrowPlan doc persisted; values flow straight to Day.

### Dev `StartDayButton`

- Unchanged gating (`NODE_ENV === "development"`).
- Confirm dialog: "Archive today and start fresh? (Re-promotes from confirmed TomorrowPlan or settings defaults.)"
- On confirm: archive current active day, call same promote path as auto-rollover.

---

## §8 PR sequence

Three sequential PRs, each independently mergeable:

| PR | Scope | Files touched |
|---|---|---|
| **PR 1 — Schema + repo** | Extend TomorrowPlan + Day schemas; deterministic newDayId; promoteFromPlan helper; confirmTomorrowPlan/markPlanDraft helpers | `schemas.ts`, `repositories/days.ts`, `repositories/tomorrowPlans.ts`, both `.test.ts` files |
| **PR 2 — Engine rule + rollover hook** | R3.x ownerOverrides rule; useEnsureTodaysDay hook; dev StartDayButton update | `engine/rules/owners.ts` (or similar), `hooks/useEnsureTodaysDay.ts`, dashboard `page.tsx`, `StartDayButton.tsx` |
| **PR 3 — /tomorrow UI + onboarding + tab dot** | Autosave + confirm/clear; status pill; edit-revert; BottomTabs dot; onboarding "First day preview" step | `tomorrow/page.tsx`, `BottomTabs.tsx`, `hooks/useV3TomorrowDraftCount.ts`, onboarding wizard files |

Each PR ships with full test coverage (unit + integration where applicable), gets the standard reviewer+simplifier pair, and is independently merge-safe — PR 1 alone changes nothing user-visible; PR 2 enables silent defaults-based auto-promote; PR 3 unlocks the planning flow.

---

## §9 Open implementation details (to settle during PR work, not now)

- Debounce interval for `/tomorrow` autosave (start at 250ms, tune if needed).
- Tab-dot color: `--color-accent` (sage; matches branding) vs `--color-warning` (terracotta; more attention-grabbing). Default to accent; revisit during click-test.
- Whether "Confirm" should also dismiss the dot, or only Clear/auto-promote dismisses. Default: yes, Confirm dismisses (the dot is for "unfinished planning," not "any planning exists").
- Whether the onboarding "First day preview" step needs its own tests beyond the integration-style verification that "complete onboarding → Day 1 has wakeTime + ownerOverrides applied." Default: minimal — one happy-path integration test, no exhaustive permutations.

---

## §10 Out of scope

- Cloud Function or server-side rollover (decided client-only).
- §F18 retroactive wake-time edit (separate fast-follow, not blocked by this scope).
- Backfilling missed days into history (explicitly decided no).
- Cross-child plans (single-child + co-parent is the model; multi-child is a F4-onward concern).
- Notification / push for "you have a draft plan" reminders (decided: dot is enough).
