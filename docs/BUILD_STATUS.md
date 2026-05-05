# Build Status

> Updated: 2026-05-05 (interview wrap)

## Plans complete

- [x] **Plan 0 — Bootstrap** (PR #1, merged)
- [x] **Plan A — Scheduling Engine** (PR #1, merged)
- [x] **Plan B — Data Layer** (PR #2, merged)

## Plan C — Frontend (in progress)

### Status: requirements captured, ready to build

- [x] `docs/UI_REQUIREMENTS.md` — full UI spec, all flows, test spec
- [x] `docs/COMPONENT_INVENTORY.md` — 30+ components with build configs and 9-wave dependency order
- [ ] Theme A earth-tone palette written into `src/styles/tokens.css` (Wave 0)
- [ ] Components built (Waves 1–7)
- [ ] Pages built (Wave 8)
- [ ] Integration / PWA / E2E (Wave 9)

### How to resume

Next session, just run:

```
/session-start
```

The skill will read UI_REQUIREMENTS.md + COMPONENT_INVENTORY.md + this file, produce a briefing, and suggest the next wave. Most likely path:

1. **`/review-requirements`** — confirm everything still looks right
2. **Start Wave 0** manually:
   - Update `src/styles/tokens.css` with Theme A earth-tone palette
   - Create `src/test-utils.ts` (RTL render helper with AuthProvider mocked + hook mocks)
3. **`/build-pipeline`** — fully autonomous build of remaining waves with E2E
   - OR **`/build-component <Name>`** for a single component
   - OR **`/build-page Dashboard`** to do one page at a time

### Design decisions snapshot (full detail in UI_REQUIREMENTS.md)

- Theme: calm pastels with earth-tone preference (sage, terracotta, warm cream, dusty blue)
- Light default, optional dark
- 3 bottom tabs (Dashboard, Timeline, Tomorrow) + kebab (History, Settings, Sign out)
- Header: "Aden's Day · Mon, May 5" + sync icon
- 5 AM groggy use case → spacious touch targets, silent UI, error-only toasts
- EventEdit = bottom-sheet drawer
- Time format: "9:35 AM" / "4:23 PM" (no leading zero)
- Owner colors: Jake = dusty blue, Kelly = warm pink/coral, Daycare = neutral gray
- Putdown = projected timing indicator only, never actualized, never a button

### Known stubs / follow-ups

- **Real Firebase project** — not yet created. Allowlist + rules use real emails (`jake136@yahoo.com`, `kellyrbarber@gmail.com`) but project ID is placeholder `baby-day-planner-local`. Required before deployment.
- **`.env.local`** — committed locally with placeholder values (gitignored). Real values populate from Firebase Console > Web App.
- **Java JRE for emulator** — installed via temurin (verified working).
- **Pre-push hook** — runs `pnpm test:integration` against the emulator on every push.
- **Single child v1** — `NEXT_PUBLIC_DEFAULT_CHILD_ID=aden`; multi-child UI deferred.
- **Staging environment** — separate Firebase project + URL. Defer to deployment plan.
- **CI emulator support** — possible later (~45-60s extra) via `actions/setup-java` + `firebase-tools` + `pnpm test:integration`. Not needed yet.

### Test counts (as of 2026-05-05)

- 110 unit/mocked tests (`pnpm test`, run in CI)
- 17 emulator tests (`pnpm test:integration`, run in pre-push hook locally)
- Total: 127 tests across 31 files
- Branch coverage on `src/domain/**`: 96% average, all files ≥ 90%
