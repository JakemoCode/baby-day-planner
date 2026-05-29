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

## Testing

Workspace-wide testing discipline applies: see `~/Workspace/.claude/rules/testing.md`. Project-specific notes:

- **Test runner**: Vitest. Two scripts:
  - `pnpm test` — unit + component tests. Runs in CI.
  - `pnpm test:integration` — emulator-backed integration tests in `tests/integration/` and `src/v3/repositories/*.test.ts`. **Pre-push hook only; not yet in CI.**
- **Real Firestore emulator infra**: `tests/integration/firestore-test-utils.ts` exports `startTestEnv()` + `ALLOWED_USER` / `FORBIDDEN_USER`. Repository tests already use this; new write-path or hook-chain tests should too.
- **Engine tests**: live in `src/v3/engine/rules/*.test.ts`. All exercise the **real** `projectDay` — no engine mocks. New rule tests must follow.
- **Hook tests**: should use the real engine via `projectDay`. The pre-2026-05-12 pattern of mocking the engine (`vi.mock("../engine/projectDay")`) is a known anti-pattern; tests of that shape are being migrated (PR #121 was the first).
- **Cascade invariant test** in `src/v3/engine/rules/naps.test.ts` runs under `ALL_RULES` and asserts `wake_window(N).startTime === nap(N-1).endTime` and `wake_window(N).endTime === nap(N).startTime` across multiple scenarios. Any rule change that breaks the invariant fails CI on the specific scenario. Add similar invariant blocks when introducing new system-level properties.
- **`.toBeInTheDocument()` is banned** (existing convention from the frontend-orchestration plugin). Prefer `.toBeVisible()` or behavior assertions.
- **Pre-push harness quirk**: `pnpm test` runs the same harness as CI. `npx vitest run` exposes a flaky `uniqueRecordedKeys` test from order pollution that `pnpm test` does not — use `pnpm test` for local pre-push verification.

## Write-path-fix PRs

Any PR that fixes a bug in how docs are persisted must include a `## Contaminated data` section identifying:

- What's already in Firestore from the broken code
- Resolution: (a) automatic migration via the relevant defaulter, (b) manual cleanup instructions, or (c) explicit waiver if harmless

PR #117 (drawer time-edit putdown fix) shipped without this — the fix made future edits write `overridden`, but stale `completed` docs stayed broken until the local emulator was wiped.
