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

_All §1 items resolved as of 2026-05-10 — see §5. Add new entries here as they surface; structure: 1.20, 1.21, ..._

---

## §2 — Plan / doc updates

_All §2 items resolved as of 2026-05-10 — see §5._

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

| # | Title | Resolved by | Date |
|---|---|---|---|
| 1.1 | `parseHM24` missing from `@/v3/ui/time` | PR #90 | 2026-05-10 |
| 1.2 | JS `?? "transparent"` defeats CSS fallbacks | PR #90 | 2026-05-10 |
| 1.3 | Always-on 5px transparent stripe | PR #90 | 2026-05-10 |
| 1.4 | Belt-and-suspenders type cast | PR #90 | 2026-05-10 |
| 1.5 | Stale realisticData test description | PR #90 | 2026-05-10 |
| 1.6 | `placeAt` cast lies about return type | PR #91 | 2026-05-10 |
| 1.7 | Nested ternary in label/displayName fallback | PR-Tail | 2026-05-10 |
| 1.8 | Placeholder test file low-value | PR-Tail | 2026-05-10 |
| 1.9 | Test imports bare RTL instead of `@/test-utils` | PR #90 | 2026-05-10 |
| 1.10 | Missing `wake_window_N` test coverage | PR #90 | 2026-05-10 |
| 1.11 | Duplicate eventKey dispatch logic | PR #88 | 2026-05-10 |
| 1.12 | Duplicate `parseLocalDate` across history files | PR #89 | 2026-05-10 |
| 1.13 | ArchivedDayView empty-state divergence | PR #90 | 2026-05-10 |
| 1.14 | Dead CSS in `TomorrowForm.module.css` | PR #90 | 2026-05-10 |
| 1.15 | `PromoteTomorrowButton` focus ring invisible | PR #90 | 2026-05-10 |
| 1.16 | Dashboard cards duplicate the same patterns | PR #89 | 2026-05-10 |
| 1.17 | Drawer save logic minor polish | PR-Tail | 2026-05-10 |
| 1.18 | Drawer save test variable naming | PR #90 | 2026-05-10 |
| 1.19 | Owner attrs not centralized after §1.2 polish | PR #92 | 2026-05-10 |
| 2.1 | Plan v5 wakeTime: undefined doesn't typecheck | PR-Housekeeping | 2026-05-10 |
| 2.2 | PR-C1 audit list missing v2Backcompat grep | PR-Housekeeping | 2026-05-10 |

---

## How to add new items

1. Decide which section: §1 (code), §2 (plan/doc), §3 (already in
   FAST_FOLLOW), or §4 (process).
2. Use the next available numbering (e.g., `1.9` if §1.8 is the last).
3. Include: **Source** (PR/review/agent who found it), **What** (the
   problem), **Fix** (the proposed action), **Status**.
4. When fixed, move the entry to §5 with the resolving PR and date.

Keep entries short — link to PR comments or other docs for detail.
