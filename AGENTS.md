<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Where things live — CHECK THE SOURCEMAP FIRST

`SOURCEMAP.md` at the repo root is a directory-level map of the codebase
(layers, entry points, "where does this live?"). Consult it before
grep-walking or bulk-reading files. It is intentionally NOT file-by-file —
for exact files, query live with `Glob`/`Grep`.

## Domain model — READ THIS FIRST

`DOMAIN.md` at the repo root is the authoritative plain-English description of how babies actually behave. It is **not** a spec, **not** requirements, and **not** rules for the engine — it is the domain the implementation is supposed to fit.

Read `DOMAIN.md` before:
- Adding any new engine rule
- Reviewing requirements doc changes
- Starting any multi-PR campaign that touches scheduling logic

Drift between `DOMAIN.md` and the implementation is the canary for the "step back and audit" workspace rule (`~/Workspace/.claude/rules/step-back.md`). If the implementation overflows the model (more abstractions than the domain warrants), that IS the proactive trigger to stop and reassess.

Jake's lived experience in `DOMAIN.md` §1–§7 wins over research notes in §8 when they disagree. Update `DOMAIN.md` first when the model changes; the implementation follows.

## Engine

- **Bottle cascade.** Read `docs/v3/ENGINE_SPEC.md` §R5 (R5.1, R5.3, R5.8, R5.9), `docs/v3/BOTTLE_SPEC.md` and `DOMAIN.md` §2 before changing it. Cite the R-number in the test and the PR. Do not re-derive cascade semantics from the code. A recorded bottle cascades the forecast forward from itself and never absorbs a forecast slot. The one exception is a projected bottle edited in the drawer, which is tagged `realizedForecast: true` and absorbs the one imminent slot it realized (BOTTLE_SPEC §4).
- **Events that copy an existing type.** When a path creates an event of a type that already has a canonical path (nap converted to bedtime, say), copy that path's field shape and lifecycle. Valid states are `projected | recorded | completed` (DATA_MODEL R2.1). Before picking one, grep the rules that key off lifecycle (`putdown.ts` fires only for `projected` and `recorded`). A second click-test bug in the same conversion path means the shape is wrong, not the symptom.

## Comments

In comments and test names, drop `§F<N>` fast-follow tags. Once an item moves to `docs/v3/fast-follow/completed/`, that move is the trace. Keep `R<N>.<N>` rule refs, `ADR-000N` and `DOMAIN.md §N` anchors, because they point at live spec. A comment audit compresses essays to 1-3 lines. It does not delete them.

## Testing

Workspace-wide testing discipline applies: see `~/Workspace/.claude/rules/testing.md`. Project-specific notes:

- **Test runner**: Vitest. Two scripts:
  - `pnpm test` — unit + component tests. Runs in CI.
  - `pnpm test:integration` runs emulator-backed integration tests in `tests/integration/` and `src/v3/repositories/*.test.ts`. **Pre-push hook only; not yet in CI.** It boots its own Firestore emulator (`firebase emulators:exec`) and tears it down on exit, so a running dev server silently loses Firestore. Warn first. Afterward, restart `firebase emulators:start --only firestore --project baby-day-planner-local` in the background and wait for `lsof -ti:8080` to return a PID. An emulator restart wipes local data. If an emulator is already up, run `pnpm exec vitest run src/repositories src/v3/repositories tests/integration` instead, as the pre-push hook does.
- **Real Firestore emulator infra**: `tests/integration/firestore-test-utils.ts` exports `startTestEnv()` + `ALLOWED_USER` / `FORBIDDEN_USER`. Repository tests already use this; new write-path or hook-chain tests should too.
- **Engine tests**: live in `src/v3/engine/rules/*.test.ts`. All exercise the **real** `projectDay` — no engine mocks. New rule tests must follow.
- **Hook tests**: should use the real engine via `projectDay`. The pre-2026-05-12 pattern of mocking the engine (`vi.mock("../engine/projectDay")`) is a known anti-pattern; tests of that shape are being migrated (PR #121 was the first).
- **Test-first.** Write the failing test before the code, for every engine rule, helper and bug fix. Then write the minimum code to pass, then refactor. A new behavior on an existing rule gets its own failing test. Run `pnpm test` after each green step. Commit refactors separately from features.
- **Seam tests.** A user-action chain (CTA click, optimistic state, `projectDay`, `renderProjection`, visible output) needs at least one test in `src/v3/__tests__/` that wires the real `projectDay` and `renderProjection` together and asserts an invariant the bug class would break (see `bottleRealizeSeam.test.ts`). Unit tests on each layer pass while the join is broken.
- **Cascade invariant test** in `src/v3/engine/rules/naps.test.ts` runs under `ALL_RULES` and asserts `wake_window(N).startTime === nap(N-1).endTime` and `wake_window(N).endTime === nap(N).startTime` across multiple scenarios. Any rule change that breaks the invariant fails CI on the specific scenario. Add similar invariant blocks when introducing new system-level properties.
- **`.toBeInTheDocument()` is banned** (existing convention from the frontend-orchestration plugin). Prefer `.toBeVisible()` or behavior assertions.
- **A11y tests**: every `"use client"` component under `src/**/components/**` has a sibling `<Name>.a11y.test.tsx` that renders its visible state and asserts `expect(await axe(container)).toHaveNoViolations()` (helpers in `src/test-utils.tsx`; `color-contrast` is off — jsdom can't measure it, that's `/design-audit`'s job). CI enforces existence via `pnpm check:a11y-coverage`. When you add or change such a component, add/update its a11y test in the same PR. A component that genuinely needs none opts out with a `// a11y-exempt: <reason>` comment. The gate checks existence only — keeping the test meaningful when the component changes is on you and the review loop.
- **Pre-push in a worktree.** `core.hooksPath` is an absolute path to the main checkout's `.husky`, so the pre-push hook does run on worktree pushes. It fails typecheck until you run `pnpm install` in the worktree. If `git config core.hooksPath` ever returns the relative `.husky/_`, a fresh worktree has no hook (that dir is generated and gitignored), so run `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` by hand. PR #281 went red on `format:check` that way.
- **Pre-push harness quirk**: `pnpm test` runs the same harness as CI. `npx vitest run` exposes a flaky `uniqueRecordedKeys` test from order pollution that `pnpm test` does not — use `pnpm test` for local pre-push verification.

## Write-path-fix PRs

Any PR that fixes a bug in how docs are persisted must include a `## Contaminated data` section identifying:

- What's already in Firestore from the broken code
- Resolution: (a) automatic migration via the relevant defaulter, (b) manual cleanup instructions, or (c) explicit waiver if harmless

PR #117 (drawer time-edit putdown fix) shipped without this — the fix made future edits write `overridden`, but stale `completed` docs stayed broken until the local emulator was wiped.

## Dev server and PR hand-off

- **Fresh worktree.** `cp` the main repo's `.env.local` into the worktree (only `.env.local.example` is checked in), then run `PORT=3001 pnpm dev`. Without it Next boots but Firebase has no config and auth fails silently.
- **Reusing :3001.** Check `lsof -ti:3001 | xargs ps` before trusting a running server. A stale one from another branch makes "is feature X live?" answers wrong. Kill and restart when shipping new UI on a fresh branch.
- **Click-testable PRs.** Put numbered click-test steps with the expected visible outcome in the PR body, and paste the same steps in chat. Start the dev server in the same turn, confirm it is up, and give the URL. Then wait for Jake's feedback before calling the PR done. Skip for docs-only PRs and internal refactors.
- **Transient connection errors.** Do not edit `firebase.json`, `.env.local` or ports to fix them (an `ECONNREFUSED` once led to a `host: "0.0.0.0"` edit that Jake had to undo). Restart the process you stalled, and suggest a hard browser refresh first. Say that an emulator restart wipes local data.

## Design audit

Before reporting a `/design-audit` finding from `pnpm dev`, check whether the element is gated on `process.env.NODE_ENV === "development"`. The Next.js "N" pill and `StartDayButton` are dev-only. Run the final pass on `pnpm build && pnpm start`. The bottom nav holds three tabs on purpose; `docs/DESIGN_AUDIT.md` lists it under Acknowledged Issues, so do not re-flag it.

## Follow-ups

File follow-ups as `docs/v3/fast-follow/<now|grill|backlog>/f<N>-slug.md`, never as GitHub Issues, and add a line to the index in `docs/v3/FAST_FOLLOW.md`. Find the next free number across all four folders, `now/ grill/ backlog/ completed/`, because shipped numbers live only in `completed/`:

```sh
ls docs/v3/fast-follow/*/ | grep -oE 'f[0-9]+' | sort -t f -k2 -n | tail -1
```

## Firestore rules

Gate rules on `isSignedIn()` plus per-doc `createdBy` and `canAccessChild`, never on an email allowlist. The Auth emulator mints arbitrary emails, so an allowlist denies silently. A permission-denied snapshot listener then cascades into `FIRESTORE INTERNAL ASSERTION FAILED` crashes that only a full reload and IndexedDB wipe clear. If you see `evaluation error ... false for 'get'` right after onboarding's `writeBatch`, suspect a gate on email first. For invite-only signup, gate the `Child` create rule on an invite token.

## Runtime gotchas

- Read `NEXT_PUBLIC_*` as `process.env.NEXT_PUBLIC_X`, never `process.env[name]`. Next inlines at compile time and a dynamic key reads as undefined in the browser.
- Export real Firestore and Auth instances, never a Proxy. The SDK runs `instanceof` checks. Connect each emulator in its own service's init.
- `exactOptionalPropertyTypes` is on. Omit an optional key rather than setting it to `undefined`.
- `@typescript-eslint/consistent-type-imports` bans inline `import("...")` types. Use a top-level `import type`. CI catches this, typecheck and tests do not.
- React 19 lint rejects prop-to-state sync in effects (`react-hooks/set-state-in-effect`) and `Date.now()` in render (`react-hooks/purity`).
- `useV3Events` skips its subscription when `dayId` is empty, because Firestore rejects ids matching `__.*__`.
- `vitest.setup.ts` seeds default Firebase env vars so tests do not crash on module load.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm test` before every push. CI runs lint and `format:check` separately, and PR #44 went red twice on the two it skipped. `pnpm format` fixes formatting.
