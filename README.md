# Baby Day Planner

Private, mobile-first PWA for projecting and managing the day's baby schedule for bottles, naps, wake windows, pumping, and owner assignments. Two users (Jake + Kelly), Firebase backend, realtime sync.

> What happens next, and how did the latest bottle/nap change the rest of today?

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript (strict)
- CSS Modules + `tokens.css`
- Firebase (Firestore + Auth)
- Vitest + React Testing Library, Playwright (E2E)

## Local development

```bash
pnpm install
cp .env.local.example .env.local   # fill in values from Firebase console
pnpm dev                            # Next.js on :3000
firebase emulators:start            # Firestore :8080, Auth :9099, UI :4000 (separate terminal)
                                    # Requires Java JRE: `brew install --cask temurin`
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server with Turbopack |
| `pnpm build` | Production build |
| `pnpm test` | Vitest unit/integration tests |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |

## Plans

- [`docs/2026-05-04-bootstrap.md`](docs/2026-05-04-bootstrap.md) — bootstrap (this plan)
- [`docs/2026-05-04-scheduling-engine.md`](docs/2026-05-04-scheduling-engine.md) — pure TS scheduling domain

## PRD

`/Users/jakemosher/Workspace/docs/private_baby_day_planner_v1_prd.md`
