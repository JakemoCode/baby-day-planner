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
