# Component Inventory

> Living map of the V3 component tree. Pre-V3 build-config detail
> (test paths, hook imports, build status) is archived at
> `_archive/v3/COMPONENT_INVENTORY_BUILD_PLAN.md`.

## Routes

| Route | File | Notes |
|---|---|---|
| `/sign-in` | `src/app/sign-in/page.tsx` | Public; Google OAuth via Firebase |
| `/` | `src/app/(authed)/page.tsx` | Dashboard (default after sign-in) |
| `/timeline` | `src/app/(authed)/timeline/page.tsx` | Today's vertical timeline |
| `/tomorrow` | `src/app/(authed)/tomorrow/page.tsx` | Tomorrow Plan editor + preview |
| `/day-templates` | `src/app/(authed)/day-templates/page.tsx` | Weekend / named templates |
| `/history` | `src/app/(authed)/history/page.tsx` | Last 7 archived days |
| `/history/[date]` | `src/app/(authed)/history/[date]/page.tsx` | Read-only archived day |
| `/settings` | `src/app/(authed)/settings/page.tsx` | All settings inline |
| Authed layout | `src/app/(authed)/layout.tsx` | Wraps in `AppShell` |

## App shell — `src/components/shared/`

Framework-agnostic chrome; survived the PR-C1 V2 wipe.

| Component | Purpose |
|---|---|
| `AppShell` | Header + main + BottomTabs frame |
| `Header` | Title, date, sync icon |
| `BottomTabs` | 3 tabs + kebab |
| `KebabMenu` | Overflow menu (history, settings, sign out) |
| `FAB` | Floating + button → opens `FABTypePicker` |
| `FABTypePicker` | Event-type picker; uses `BottomSheet` chrome |
| `BottomSheet` | Reusable bottom-sheet primitive |
| `ConfirmDialog` | Destructive-action confirmation |
| `EmptyState` / `LoadingState` | Generic fallback panels |
| `SyncStatusIcon` | Firestore sync indicator |

## Dashboard — `src/v3/components/Dashboard/`

| Component | Purpose |
|---|---|
| `NextEventCard` | Primary card — next non-WW event with owner |
| `NextBottlePanel` | Secondary — next bottle + per-day totals |
| `NextSleepPanel` | Secondary — next nap/bedtime + per-day totals |
| `NowBanner` | Wake-window + in-progress sleep banner |
| `OwnerPill` | Compact owner display |
| `PreviewCard` | Card scaffold reused across panels |
| `ActionButton` | Base CTA button used by the contextual + day actions |
| `ContextualActionButton` | Single multi-mode dashboard button (End Nap / Log bottle now / End overnight sleep; hidden otherwise). Replaced the per-action `StartBottleButton` / `NapActionButton` — see ADR-0001, ADR-0003 |
| `StartDayButton` | Dev-only — see §F17 fast-follow for auto-anchor plan |
| `dashboardStats.ts` | Selector helpers (totals, last-X, next-event filtering) |

`EndOfDayCard` was retired in §F32 (PR #173); dashboard always shows
stats now.

## Timeline — `src/v3/components/Timeline/`

| Component | Purpose |
|---|---|
| `TimelineV3` | The vertical timeline; root |
| `Block` | Duration block (naps, bedtime, pump, duration extras) |
| `InstantChip` | Point-in-time chip (bottles, instant extras, daycare) |
| `InstantCluster` | 2–3 chips at same time, shared timestamp |
| `NowBar` | Current-time indicator line |
| `groupInstants.ts` | Chip-clustering logic |
| `expandPutdown.ts` | Putdown render-expansion pass |
| `ownerSlotKey.ts` | Owner-slot key helper |

## Tomorrow — `src/v3/components/Tomorrow/`

| Component | Purpose |
|---|---|
| `TomorrowForm` | Wake time + template + extras editor |
| `TomorrowPreview` | Projected-day preview using the same engine |
| `PromoteTomorrowButton` | Promote plan → today (or auto-fires next morning if setting on) |

## Day templates — `src/v3/components/DayTemplates/`

| Component | Purpose |
|---|---|
| `TemplateOwnerPicker` | Per-event owner picker; owns its chrome (§F13 PR #175) |
| `setOwnerInTemplate.ts` / `templateSlot.ts` | Template helpers |

## History — `src/v3/components/History/`

| Component | Purpose |
|---|---|
| `HistoryList` | Last 7 archived days |
| `HistoryDayCard` | Single archived-day summary row |
| `ArchivedDayView` | Read-only archived timeline |

## Settings — `src/v3/components/Settings/`

The Settings page is mostly inline in `src/app/(authed)/settings/page.tsx`
(row helpers — `Section`, `TimeRow`, `NumberRow`, `WakeWindowsRow`,
`PumpTimesRow`, `OwnerSlotRow`, `ColorModeRow`, `CheckboxRow`).
The one extracted component:

| Component | Purpose |
|---|---|
| `OwnersConfigEditor` | Owners block with names + colors + add-other |

## Shared V3 — `src/v3/components/shared/`

| Component | Purpose |
|---|---|
| `EventEditDrawerV3` | Edit drawer for all event types |
| `OwnerPickerV3` | Owner picker for the drawer |
| `SettingsAccount` | Account row (current user + sign-out) |
| `createEventTemplate.ts` / `formToEvent.ts` | Event conversion helpers |

## Auth — `src/lib/auth/`

| Component | Purpose |
|---|---|
| `AuthProvider` | Firebase Auth context |
| `SignIn` | Google sign-in screen |

## Tokens & styles

| File | Purpose |
|---|---|
| `src/styles/tokens.css` | All design tokens (palette, spacing, owner colors, type) |
| Per-component `*.module.css` | Co-located CSS Modules — no runtime CSS-in-JS |

## Engine + data (referenced by components, not components themselves)

| Layer | Path |
|---|---|
| Engine | `src/v3/engine/` (rules in `engine/rules/`) |
| Rendering | `src/v3/ui/renderProjection.ts` |
| Schemas | `src/v3/schemas.ts` |
| Repositories | `src/v3/repositories/` |
| Hooks | `src/v3/hooks/` |
