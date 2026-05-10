# V3 Cutover Cleanup Tracker

> **Purpose**: living list of small bugs, missing methods, plan/doc
> drift, and other "we'll get to it" items surfaced during the V3
> cutover. Anything that's not big enough for its own PR ticket but
> shouldn't be lost goes here.
>
> **How to use**: add new findings to the appropriate section below as
> they emerge. Don't delete completed items — move them to
> "Resolved" so we can audit later.
>
> **Companion docs**: `docs/v3/CUTOVER_PLAN.md` (the master plan),
> `docs/v3/FAST_FOLLOW.md` (post-cutover backlog).

---

## §1 — Code-level cleanup (quick polish PRs)

### 1.1 `parseHM24` missing from `@/v3/ui/time.ts`

**Source**: PR #84 (PR-A5 Tomorrow pieces), 2026-05-10.

**What**: `src/v3/ui/time.ts` exports `formatHM24`, `formatTimeForDisplay`, `formatTimeShort`. The plan and several agents reference `parseHM24` (the inverse — "HH:MM" string → TimeMin), but it doesn't exist. Multiple agents have copy-pasted local versions:

- `src/v3/components/shared/EventEditDrawerV3.tsx` (local helper)
- `src/v3/components/Tomorrow/TomorrowForm.tsx` (local helper, flagged in PR #84)

**Fix**: add `parseHM24(s: string): TimeMin` to `src/v3/ui/time.ts`. Refactor call sites to import it. Delete local copies.

**Status**: pending. Bundle into the polish PR after Phase A merges.

---

### 1.2 PR #79 (A0.11) — JS `?? "transparent"` defeats CSS fallbacks

**Source**: code-simplifier review of PR #79.

**What**: `Block.tsx`, `InstantChip.tsx`, `OwnerPickerV3.tsx` apply
```ts
style={{ "--owner-color": ownerColor(...) ?? "transparent" }}
```
The CSS modules already declare per-rule fallbacks (e.g.,
`color: var(--owner-color, var(--color-accent))`,
`border-color: var(--owner-color, var(--color-border))`).
The JS coalesce flattens those to `transparent` before CSS sees the
value, so the meaningful per-rule fallbacks never fire.

**Fix**: drop the `?? "transparent"` in JS. Pass `ownerColor(...)` (which
is `string | null`) directly; let CSS fallbacks handle the missing case.

**Status**: pending. Bundle into polish PR.

---

### 1.3 PR #79 (A0.11) — Always-on 5px transparent stripe

**Source**: code-simplifier review of PR #79.

**What**: `Block.module.css` declares
`border-left: 5px solid var(--owner-color, transparent);` unconditionally.
For unowned blocks the stripe is transparent but still consumes 5px
of layout width, shifting alignment.

**Fix**: gate the stripe via `[data-owner]` attribute selector so
unowned blocks don't render the border at all:
```css
.block { /* base styles, no border-left */ }
.block[data-owner] { border-left: 5px solid var(--owner-color); }
```

**Status**: pending. Bundle into polish PR.

---

### 1.4 PR #79 (A0.11) — Belt-and-suspenders type cast

**Source**: code-simplifier review of PR #79.

**What**:
```ts
style={{ ["--owner-color" as string]: c, ...other } as React.CSSProperties}
```
The `as string` index cast PLUS the outer `as React.CSSProperties` is
redundant. Modern React types accept `--*` custom properties via
`CSSProperties` directly — one cast (the outer one) suffices.

**Fix**: drop the `["--owner-color" as string]` cast.

**Status**: pending. Cosmetic; bundle into polish PR.

---

### 1.5 PR #75 (A0.12) — Stale test description

**Source**: code-reviewer review of PR #75.

**What**: `src/v3/__tests__/realisticData.test.ts:205` has the test name
`"V2-shape settings + actuals → engine produces sorted events (with the pump-NaN gap noted above)"`.
The "pump-NaN gap" is the bug A0.12 fixed; the comment is misleading
post-merge.

**Fix**: rename to e.g.
`"V2-shape settings + actuals → engine does not throw and preserves recorded events"`.

**Status**: pending. Bundle into polish PR.

---

### 1.6 PR #73 (A0.3) — `placeAt` cast lies about return type

**Source**: code-reviewer C self-deception audit + simplifier review.

**What**: `src/v3/components/DayTemplates/setOwnerInTemplate.ts` has a
helper `placeAt` that fills array gaps with `undefined` entries, then
casts the result to `OwnerRef[]`. The schema declares
`OwnershipTemplate.napOwners: OwnerRef[]` (non-nullable), so the cast
violates the contract for any sparse-write that goes through it.

**Fix options**:
1. Widen the schema to `napOwners: (OwnerRef | undefined)[]` —
   honest but ripples through engine code.
2. Backfill gaps with a sentinel `OwnerRef` (e.g., `parent1`) — keeps
   schema honest but loses information.
3. Reject the call when N exceeds current length — explicit error.

**Recommended**: option 1. Engine R12 owner-inheritance rules already
handle missing slots gracefully via the `e.owner === undefined` gate.

**Status**: pending. Schema change — own dedicated PR; not a polish-PR
candidate.

---

### 1.7 PR #74 (A0.7) — Nested ternary in label/displayName fallback

**Source**: code-simplifier review of PR #74.

**What**: `withV2TemplateBackcompat` has a nested ternary that the
project's lint rules discourage. Reads cleanly at two levels but could
flatten to an `if`/`else if` chain.

**Fix**: low-priority refactor.

**Status**: pending. Bundle into polish PR if time allows; otherwise
skip.

---

### 1.8 PR #78 (A0.10) — Placeholder test file is low-value

**Source**: code-simplifier review of PR #78.

**What**: `src/v3/hooks/projectionPlaceholders.test.ts` asserts at
runtime what TypeScript already proves at compile time
(`PLACEHOLDER_DAY satisfies Day`). Adds no real coverage.

**Fix**: replace with a single `expectTypeOf<typeof PLACEHOLDER_DAY>().toEqualTypeOf<Day>()`
or delete the file.

**Status**: pending. Bundle into polish PR.

---

### 1.9 PR #82 (A4) — Test imports bare RTL instead of `@/test-utils`

**Source**: code-reviewer of PR #82.

**What**: `src/v3/components/DayTemplates/TemplateOwnerPicker.test.tsx`
imports `render`/`screen` directly from `@testing-library/react` and
`userEvent` from `@testing-library/user-event`. Project convention
(used elsewhere) is `@/test-utils` which re-exports both plus shared
test wrappers.

**Fix**:
```ts
import { render, screen, userEvent } from "@/test-utils";
```

**Status**: pending. Bundle into polish PR.

---

### 1.10 PR #82 (A4) — Missing `wake_window_N` test coverage

**Source**: code-reviewer of PR #82.

**What**: spec calls for nap_N / wake_window_N / bottle_N / bedtime
coverage in `TemplateOwnerPicker.test.tsx`. Nap, bottle, bedtime
have dedicated tests; `wake_window_N` is absent. The branch in the
component (line 62) is untested.

**Fix**: add a test with `wake_window_1` event and a template whose
`wakeWindowOwners[0]` is set; assert the correct button is
`aria-pressed="true"`.

**Status**: pending. Bundle into polish PR.

---

### 1.11 PR #82 + PR #73 — Duplicate eventKey dispatch logic

**Source**: code-simplifier review of PR #82.

**What**: `TemplateOwnerPicker.tsx` (read side) and
`setOwnerInTemplate.ts` (write side) both do nearly-identical
`eventKey` regex dispatch (`NAP_RE`, `WAKE_RE`, `BOTTLE_RE`, plus
the `bedtime` literal). Duplicated logic risks drift.

**Fix**: extract a shared module
`src/v3/components/DayTemplates/templateSlot.ts`:

```ts
type TemplateSlot =
  | { kind: "bedtime" }
  | { kind: "nap" | "wakeWindow" | "bottle"; index: number };

export function templateSlotForEvent(event: Event): TemplateSlot | undefined;
export function getOwnerAt(template, slot): OwnerRef | undefined;
export function setOwnerAt(template, slot, owner): OwnershipTemplate;
```

Then both consumers become thin wrappers over a single dispatch.

**Status**: pending. Refactor candidate; own dedicated PR.

---

### 1.12 PR #85 (A3) — Duplicate `parseLocalDate` across history files

**Source**: code-simplifier review of PR #85.

**What**: `parseLocalDate` defined identically in
`ArchivedDayView.tsx` and `HistoryDayCard.tsx`. Two near-identical
`Intl.DateTimeFormat` instances differ only by `year`.

**Fix**: extract to `src/v3/lib/date.ts` with
`parseLocalDate(date: string): Date` and
`formatLocalDate(date, opts: { withYear?: boolean })`.

**Status**: pending. Bundle into polish PR.

---

### 1.13 PR #85 (A3) — ArchivedDayView empty-state divergence

**Source**: code-simplifier review of PR #85.

**What**: `ArchivedDayView` rolls its own `.empty` div + CSS.
`HistoryList` (sibling component in the same PR) uses the shared
`<EmptyState>` component. Inconsistent.

**Fix**: switch `ArchivedDayView` to use `<EmptyState>`; delete the
`.empty` rule from `ArchivedDayView.module.css`.

**Status**: pending. Bundle into polish PR.

---

### 1.14 PR #84 (A5) — Dead CSS in `TomorrowForm.module.css`

**Source**: code-simplifier review of PR #84.

**What**: `TomorrowForm.module.css` has ~100 of 147 lines of unused
classes (`.hint`, `.section`, `.sectionHeader`, `.sectionTitle`,
`.addButton`, `.extraList`, `.extraRow`, `.extraButton`,
`.extraTime`, `.removeButton`, `.empty`). Leftovers from V2's
richer form.

**Fix**: delete unreferenced classes from the V3 file. Keep only
`.form`, `.field`, `.label`, `.input`, `.select`.

**Status**: pending. Bundle into polish PR.

---

### 1.15 PR #84 (A5) — `PromoteTomorrowButton` focus ring invisible

**Source**: code-simplifier review of PR #84.

**What**: Focus ring is `outline: 2px solid var(--color-accent)` on
top of a `background: var(--color-accent)` button — accent-on-accent
disappears.

**Fix**: use `var(--color-fg)` or apply `outline-offset` so the
ring is visible against the button background.

**Status**: pending. Bundle into polish PR.

---

### 1.16 PR #79 (A0.11) reflagged: V3 dashboard cards duplicate the same patterns

**Source**: code-simplifier review of PR #86.

**What**: 8 dashboard cards in `src/v3/components/Dashboard/` share
substantial duplicated patterns:
- **PreviewCard shell**: `NextBottlePreview` + `NextNapPreview`
  render the same JSX skeleton 3× each (next/empty/alt-event
  branches). Already share `PreviewCard.module.css`.
- **OwnerPill / `--owner-color` style**: `NextEventCard` +
  `CurrentWakeWindowStatus` build the same pill + style object.
  `NextNapPreview` uses `ownerDisplayName` but skips color.
- **`currentLocalMinutes()`**: duplicated verbatim in
  `NapActionButton` and `StartBottleButton`.
- **`formatDelta` / `formatDuration`**: near-identical h/m
  formatters in `NextEventCard` and `NextNapPreview`.
- **`formatLast`**: both preview cards have their own copy.
- **Action button class composition**: `NapActionButton` does
  `${styles.button} ${styles.secondary}`; `StartDayButton` does
  similar with different module imports.

**Fix candidates**:
- Extract `<PreviewCard heading primary|empty subtitle meta />` —
  highest value
- Extract `<OwnerPill owner owners />` or `useOwnerStyle()` hook
- Hoist `currentLocalMinutes()` to `@/v3/ui/time`
- Consolidate `formatDelta`/`formatDuration` into
  `formatHoursMinutes(min, { prefix? })` in `@/v3/ui/time`
- Extract `<ActionButton variant="primary"|"secondary"|"danger">`

**Status**: pending. Coherent body of work — own dedicated PR
(probably as a single dashboard refactor PR rather than scattered).

---

### 1.17 PR #81 (A0.4) — Drawer save logic minor polish

**Source**: code-simplifier review of PR #81.

**What** (low priority):
- Duplicated `actuals.some(...)` checks in `onSave` and `onDelete`
  — extract once: `const isPersisted = drawer.open && drawer.mode === "edit" && actuals.some(a => a.id === drawer.event.id)`
- Three multi-line "PR-A0.4 actuals-membership" comments could
  collapse to one named helper (`isPersistedActual`)
- Linear `actuals.some` is O(n); a memoized `Set<string>` of ids
  or an `id.startsWith("proj-")` shortcut would suffice — though
  the page renders are small enough that this rarely matters
- Test wrapper duplicates page logic instead of importing it; if
  the routing contract matters, lift it into a tiny pure
  `routeSave(event, actuals)` helper and unit-test that

**Fix**: refactor when next touching the file.

**Status**: pending. Bundle into polish PR.

---

### 1.19 Owner attrs not centralized after §1.2 / §1.4 polish

**Source**: code-simplifier review of PR #90 (cleanup polish bundle).

**What**: PR #90 fixed the `?? "transparent"` flattening bug across `Block.tsx` / `InstantChip.tsx` / `OwnerPickerV3.tsx`, but each component now does the conditional `--owner-color` spread + `data-owner` attribute open-coded in three slightly different shapes (Block merges with positioning; InstantChip and OwnerPickerV3 each ternary on the whole `style` prop). The `as React.CSSProperties` cast also lives at three sites.

**Fix**: extract a small helper in `src/v3/ui/ownerStyle.ts`:

```ts
export function ownerAttrs(ref: OwnerRef | undefined, owners: OwnersConfig) {
  const slotKey = ownerSlotKey(ref);
  const color = ownerColor(ref, owners);
  return {
    ...(slotKey ? { "data-owner": slotKey } : {}),
    style: color ? ({ "--owner-color": color } as React.CSSProperties) : undefined,
  };
}
```

Then `<Tag {...ownerAttrs(event.owner, owners)}>` (with InstantChip / OwnerPickerV3 inlining the helper directly) and `<Tag {...ownerAttrs(...)} style={{ ...positioning, ...ownerAttrs(...).style }}>` (Block, which merges with absolute-position vars).

**Status**: pending. Pairs with §1.2/§1.4 — file-of-origin fixed but the duplicated shape was left for a follow-up to keep PR #90 strictly scoped to the §1 checklist.

---

### 1.18 PR #81 (A0.4) — Drawer save test variable naming

**Source**: code-reviewer of PR #81.

**What**: test stub uses `actuals.some(a => a.id === overriddenNap.id)`
where the spec calls for mirroring `drawer.event.id`. Functionally
equivalent (same value, same closure), but the comment on the page
explicitly references `drawer.event.id` so the test stub should
mirror that name to make intent explicit.

**Fix**: rename or add a clarifying comment.

**Status**: pending. Trivial; bundle into polish PR.

---

## §2 — Plan / doc updates

### 2.1 Plan v5: explicit `wakeTime: undefined` doesn't typecheck

**Source**: PR-A0.10 agent, 2026-05-10.

**What**: `docs/v3/CUTOVER_PLAN.md` PR-A0.10 spec says
"`PLACEHOLDER_DAY` must explicitly include `wakeTime: undefined` for
`exactOptionalPropertyTypes` safety". This is wrong — under
`exactOptionalPropertyTypes`, declaring `wakeTime: undefined` for an
optional `wakeTime?: TimeMin` is a TS error (TS2375). The agent
correctly omitted the field instead.

**Fix**: update plan v5/v6 to say "omit the `wakeTime` field" instead.

**Status**: pending. Fold into next plan amendment.

---

### 2.2 PR-C1 audit list missing one grep

**Source**: PR-A0.7 / PR-A0.8 implementation.

**What**: PR-C1's pre-merge audit list grep for V2 hook imports but
doesn't explicitly grep for `from "@/v3/firestore/v2Backcompat"`. The
shim file deletion in PR-C1 already kills imports transitively, but
adding the explicit grep makes the audit airtight.

**Fix**: add to PR-C1 wipe pre-merge audits:
```bash
grep -rn 'from "@/v3/firestore/v2Backcompat"' src/
```

**Status**: pending. Fold into next plan amendment.

---

## §3 — Backlog items (already in `FAST_FOLLOW.md`)

These are tracked elsewhere; listed here only so they're visible
during cleanup planning.

- **§F3** — First-time user onboarding (dashboard)
- **§F4** — Owner color picker as themes (no raw hex)
- **§F5** — Wake windows editor: missing "after morning wake-up" row;
  inputs should be HH:MM duration
- **§F6** — Better time/duration input UX (replace native `<input type="time">`)
- **§F7** — Delete v2Backcompat shim after cutover (auto-handled by
  PR-C1 — keep §F7 as a verification step)

---

## §4 — Process notes (not code)

### 4.1 Agent worktree cwd drift

Several PR agents (PR-A0.3, A0.4, A0.6, A0.8, A0.12, A4) initially
wrote files into the main checkout instead of their assigned worktree.
All recovered by re-applying in the worktree path; nothing committed
to main accidentally. Worth flagging in agent prompts to set cwd
explicitly.

### 4.2 Bash permission denial in review subagents

~half of the `feature-dev:code-reviewer` and `code-simplifier:*`
agents dispatched against open PRs hit "no Bash permission" and
reviewed local working tree on whatever branch was checked out
(produced false-alarm "missing changes" reports). Verified PRs
directly with `gh pr diff <num>` instead.

Mitigation: when dispatching review agents, paste the diff content
directly into the prompt rather than asking them to fetch it via
`gh pr diff`.

### 4.3 Pre-existing flake in `EventEditDrawerV3.test.tsx`

PR-A0.8 agent flagged a flaky test in
`src/v3/components/shared/EventEditDrawerV3.test.tsx` involving
`annotatedAt` timestamp comparison. Pre-existing (not caused by
A0.8). PR-A0.4 (PR #81) added more tests in the same file —
verify the flake is still present (or now resolved) after A0.4 merges.

### 4.4 Per-PR review loop must be enforced (lesson learned)

Captured in memory at
`feedback_parallel_pr_review_loop.md`. For multi-PR campaigns:
- Every PR an agent opens MUST trigger code-reviewer +
  code-simplifier dispatch in the SAME response.
- Use per-PR task triples (`PR-X impl`, `PR-X reviewer`,
  `PR-X simplifier`) — never a single fuzzy "review loop" task.
- Phase-complete status is mechanically blocked until all triples
  close.

**Why captured**: 2026-05-10 V3 cutover Phase A0 — dispatched
reviews on first 6 PRs (#72-#77), then dropped the loop for
#80-#86 while marking the phase "done." Caught by Jake. Root
cause: I let "PR opened" stand in for "PR done" without enforcing
the review step.

### 4.5 Reviewer Bash-permission denial pattern

`feature-dev:code-reviewer` and `code-simplifier:*` agents
sometimes hit "no Bash permission" denials when dispatched against
open PRs. Without `gh pr diff`, they review the local working
tree on whatever branch is checked out — produces false-alarm
"missing changes" / "wrong file" reports (PR #76, #82, #84, #85
review agents all hit this).

**Mitigation**: paste `gh pr diff <num>` output INTO the agent
prompt body rather than asking the agent to fetch it. Eliminates
the false-alarm class entirely.

---

## §5 — Resolved

(items move here when fixed; date and PR ref required)

_None yet._

---

## How to add new items

1. Decide which section: §1 (code), §2 (plan/doc), §3 (already in
   FAST_FOLLOW), or §4 (process).
2. Use the next available numbering (e.g., `1.9` if §1.8 is the last).
3. Include: **Source** (PR/review/agent who found it), **What** (the
   problem), **Fix** (the proposed action), **Status**.
4. When fixed, move the entry to §5 with the resolving PR and date.

Keep entries short — link to PR comments or other docs for detail.
