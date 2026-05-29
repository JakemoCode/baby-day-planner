# SOURCEMAP

**Read this before grep-walking the tree.** It answers *"where does this
live?"* at directory granularity — not file-by-file (files churn; layers
don't). For *what terms mean* see `CONTEXT.md`; for *how babies behave* see
`DOMAIN.md`; for *how to work/test here* see `AGENTS.md`; for *why a decision
was made* see `docs/adr/`.

> Keyed to **layers**, not files. When a file moves within its layer, this map
> stays correct. If a whole layer's *purpose* changes, update the row.

---

## Orientation docs (read-first, by question)

| Question | File |
|---|---|
| How do babies actually behave? (authoritative domain) | `DOMAIN.md` |
| What does a V3 term/rule mean? (glossary) | `CONTEXT.md` |
| How do I work and test in this repo? | `AGENTS.md` |
| Why was X decided? | `docs/adr/000N-*.md` |
| What's built / in progress? | `docs/BUILD_STATUS.md`, `docs/v3/FAST_FOLLOW.md` |
| Component catalog | `docs/COMPONENT_INVENTORY.md` |

---

## The stack, top to bottom

Everything live is under `src/v3/`. `src/app/` is the Next.js App Router shell;
`src/lib/` is cross-cutting infra (auth, firebase client, paths).

```
Next.js routes  ──>  React components  ──>  hooks (useV3*)  ──>  repositories
   src/app/            src/v3/components/      src/v3/hooks/        src/v3/repositories/
                                                    │                     │
                                                    ▼                     ▼
                                          engine (pure forecast)    Firestore
                                          src/v3/engine/            (via firestore/ defaulters+converters)
```

---

## `src/v3/` — the live application

| Dir / file | Job | Entry point |
|---|---|---|
| `engine/` | **Pure** day-projection. No I/O, no React. Takes events+settings → forecast. | `projectDay.ts` |
| `engine/rules/` | One file per rule family (naps, bottles, putdown, owners, daycare, pumps…). Each exports a resolver run by the evaluator. | `index.ts` (rule registry), `naps.ts` |
| `engine/evaluator.ts` | Runs the rule pipeline over a day. | — |
| `engine/bottleIntervalRules.ts` | Bottle-spacing logic (its own file by size). | — |
| `repositories/` | Firestore read/write per collection (children, days, events, settings, templates, tomorrowPlans, users, invites). | one file per collection |
| `firestore/` | Defaulters + converters — shape data on the way in/out of Firestore. **Write-path bugs live here** (see AGENTS.md "Contaminated data"). | `eventDefaults.ts`, `converters.ts` |
| `hooks/` | ~18 hooks. `useV3*` = live Firestore subscriptions (Child/Day/Events/Projection/Settings/Templates/User/TomorrowPlan). Others = page/UI state machines. | `useV3Projection.ts`, `useDayPageState.ts` |
| `context/` | `ChildProvider` — selected-child context. | `ChildProvider.tsx` |
| `components/` | UI organized **by page**: `Dashboard/` (39 files), `Timeline/`, `Tomorrow/`, `History/`, `Settings/`, `DayTemplates/`, `shared/`. | per-page dir |
| `ui/` | Primitive/presentational widgets (no domain logic). | — |
| `lib/` | V3-local helpers. | — |
| `lifecycle.ts` | Event lifecycle states (projected → recorded, etc.). Match existing lifecycle when converting event types. | — |
| `schemas.ts` | Zod schemas / shared types for V3 entities. | — |
| `selectors.ts` | Derived reads over projection/state. | — |
| `__tests__/` | Cross-cutting tests + `fixtures/`. | — |

### Engine rule files (`engine/rules/`)
`naps` · `bottles` · `putdown` · `owners` · `daycare` · `pumps` ·
`dailyRecurring` · `missingScheduledEvents` · `wakeWindowOverrides`.
Each has a co-located `*.test.ts` exercising the **real** `projectDay`
(no engine mocks — see AGENTS.md). Cascade invariant test lives in `naps.test.ts`.

---

## `src/app/` — Next.js App Router

Route groups gate on auth/child state:

| Route | Page |
|---|---|
| `/` (dashboard) | `(signed-in-with-child)/page.tsx` |
| `/timeline` | `(signed-in-with-child)/timeline/page.tsx` |
| `/tomorrow` | `(signed-in-with-child)/tomorrow/page.tsx` |
| `/settings`, `/history`, `/history/[date]`, `/day-templates` | `(signed-in-with-child)/…` |
| `/welcome` | `(signed-in-no-child)/welcome/page.tsx` |
| `/sign-in`, `/invite/[token]` | `sign-in/`, `invite/[token]/` |

Nav is intentionally 3 tabs (Dashboard/Timeline/Tomorrow); the rest live in
the kebab — don't re-flag as a discoverability bug.

> ⚠️ This is a modified Next.js — read `node_modules/next/dist/docs/` before
> writing route/framework code (per AGENTS.md).

---

## `src/lib/` — cross-cutting infra

| Dir | Job |
|---|---|
| `auth/` | `useAuth.ts` |
| `firebase/` | `client.ts` — Firebase SDK init |
| `firestore/` | `paths.ts` — collection-path builders |
| `invites/` | `sendInviteEmail.ts` |

---

## Tests & infra at a glance

| Where | What | Runs |
|---|---|---|
| co-located `*.test.ts(x)` | unit + component | `pnpm test` (CI) |
| `tests/integration/`, `repositories/*.test.ts` | emulator-backed | `pnpm test:integration` (pre-push only) |
| `firestore.rules` | security rules | — |
| `playwright.config.ts`, `tests/` | E2E | — |

---

_Granularity is deliberate: directory + entry-point only. If you find yourself
wanting to add a file-by-file listing, prefer `Glob`/`Grep` instead — that
data is better queried live than mirrored here._
