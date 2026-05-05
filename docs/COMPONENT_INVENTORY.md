# Baby Day Planner — Component Inventory

> Per-component build spec. Build order respects Dependencies. Pages last.
> "GraphQL" replaced with "Hook" since this app uses Firestore via custom hooks (`@/hooks/*`) and the engine selectors (`@/domain/selectors`).

---

## Foundation (build first; tokens.css update precedes any component)

### tokens.css update (palette swap, not a component)
- **File:** `src/styles/tokens.css`
- **Action:** Replace placeholder hex with Theme A earth-tone palette (sage / terracotta / warm cream / dusty blue) + light/dark mode CSS-variable structure. Owner colors per UI_REQUIREMENTS.
- **Build status:** [ ] not started

## SyncStatusIcon
- Page: shared
- Dependencies: none
- Hook: useSyncStatus
- Complexity: low
- Build config:
  - File: src/components/shared/SyncStatusIcon.tsx
  - Test: src/components/shared/SyncStatusIcon.test.tsx
  - Styles: src/components/shared/SyncStatusIcon.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useSyncStatus
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## OwnerPicker
- Page: shared
- Dependencies: none
- Hook: none
- Complexity: low
- Build config:
  - File: src/components/shared/OwnerPicker.tsx
  - Test: src/components/shared/OwnerPicker.test.tsx
  - Styles: src/components/shared/OwnerPicker.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: none
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## ConfirmDialog
- Page: shared
- Dependencies: none
- Hook: none
- Complexity: low
- Build config:
  - File: src/components/shared/ConfirmDialog.tsx
  - Test: src/components/shared/ConfirmDialog.test.tsx
  - Styles: src/components/shared/ConfirmDialog.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: none
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## EmptyState
- Page: shared
- Dependencies: none
- Hook: none
- Complexity: low
- Build config:
  - File: src/components/shared/EmptyState.tsx
  - Test: src/components/shared/EmptyState.test.tsx
  - Styles: src/components/shared/EmptyState.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: none
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## LoadingState
- Page: shared
- Dependencies: none
- Hook: none
- Complexity: low
- Build config:
  - File: src/components/shared/LoadingState.tsx
  - Test: src/components/shared/LoadingState.test.tsx
  - Styles: src/components/shared/LoadingState.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: none
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## FAB
- Page: shared
- Dependencies: none
- Hook: none
- Complexity: low
- Build config:
  - File: src/components/shared/FAB.tsx
  - Test: src/components/shared/FAB.test.tsx
  - Styles: src/components/shared/FAB.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: none
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## Header
- Page: shared
- Dependencies: SyncStatusIcon
- Hook: useDay (for date display)
- Complexity: low
- Build config:
  - File: src/components/shared/Header.tsx
  - Test: src/components/shared/Header.test.tsx
  - Styles: src/components/shared/Header.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useDay
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## BottomTabs
- Page: shared
- Dependencies: none
- Hook: none
- Complexity: low
- Build config:
  - File: src/components/shared/BottomTabs.tsx
  - Test: src/components/shared/BottomTabs.test.tsx
  - Styles: src/components/shared/BottomTabs.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: none (uses next/navigation usePathname)
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## KebabMenu
- Page: shared
- Dependencies: none
- Hook: useAuth (for sign out)
- Complexity: low
- Build config:
  - File: src/components/shared/KebabMenu.tsx
  - Test: src/components/shared/KebabMenu.test.tsx
  - Styles: src/components/shared/KebabMenu.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/lib/auth/useAuth
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## AppShell
- Page: shared
- Dependencies: Header, BottomTabs, KebabMenu
- Hook: none
- Complexity: low
- Build config:
  - File: src/components/shared/AppShell.tsx
  - Test: src/components/shared/AppShell.test.tsx
  - Styles: src/components/shared/AppShell.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: none
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## CurrentTimeIndicator
- Page: shared
- Dependencies: none
- Hook: none (uses useEffect + setInterval + Date.now)
- Complexity: low
- Build config:
  - File: src/components/shared/CurrentTimeIndicator.tsx
  - Test: src/components/shared/CurrentTimeIndicator.test.tsx
  - Styles: src/components/shared/CurrentTimeIndicator.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: none
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## EventEditDrawer
- Page: shared
- Dependencies: OwnerPicker, ConfirmDialog
- Hook: useEvents
- Complexity: high
- Build config:
  - File: src/components/shared/EventEditDrawer.tsx
  - Test: src/components/shared/EventEditDrawer.test.tsx
  - Styles: src/components/shared/EventEditDrawer.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useEvents
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

---

## Dashboard

## NextEventCard
- Page: Dashboard
- Dependencies: none
- Hook: useDay, useEvents, useSettings (composes engine selector `nextEvent`)
- Complexity: medium
- Build config:
  - File: src/components/Dashboard/NextEventCard.tsx
  - Test: src/components/Dashboard/NextEventCard.test.tsx
  - Styles: src/components/Dashboard/NextEventCard.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useDay, @/hooks/useEvents, @/hooks/useSettings, @/domain
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## NextBottlePreview
- Page: Dashboard
- Dependencies: EmptyState
- Hook: useEvents (engine selector `nextBottle`)
- Complexity: low
- Build config:
  - File: src/components/Dashboard/NextBottlePreview.tsx
  - Test: src/components/Dashboard/NextBottlePreview.test.tsx
  - Styles: src/components/Dashboard/NextBottlePreview.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useEvents, @/domain
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## NextNapPreview
- Page: Dashboard
- Dependencies: none
- Hook: useEvents (engine selector `nextNap`)
- Complexity: low
- Build config:
  - File: src/components/Dashboard/NextNapPreview.tsx
  - Test: src/components/Dashboard/NextNapPreview.test.tsx
  - Styles: src/components/Dashboard/NextNapPreview.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useEvents, @/domain
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## CurrentWakeWindowStatus
- Page: Dashboard
- Dependencies: none
- Hook: useEvents (engine selector `currentWakeWindow`)
- Complexity: low
- Build config:
  - File: src/components/Dashboard/CurrentWakeWindowStatus.tsx
  - Test: src/components/Dashboard/CurrentWakeWindowStatus.test.tsx
  - Styles: src/components/Dashboard/CurrentWakeWindowStatus.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useEvents, @/domain
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## StartBottleButton
- Page: Dashboard
- Dependencies: none
- Hook: useEvents (createOptimistic), useSettings, useDay
- Complexity: low
- Build config:
  - File: src/components/Dashboard/StartBottleButton.tsx
  - Test: src/components/Dashboard/StartBottleButton.test.tsx
  - Styles: src/components/Dashboard/StartBottleButton.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useEvents, @/hooks/useSettings, @/hooks/useDay
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## NapActionButton
- Page: Dashboard
- Dependencies: none
- Hook: useEvents (create+update), useDay
- Complexity: low
- Build config:
  - File: src/components/Dashboard/NapActionButton.tsx
  - Test: src/components/Dashboard/NapActionButton.test.tsx
  - Styles: src/components/Dashboard/NapActionButton.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useEvents, @/hooks/useDay
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## StartDayButton
- Page: Dashboard
- Dependencies: ConfirmDialog
- Hook: useDay, useTemplates, useSettings (uses startNewDay repo)
- Complexity: medium
- Build config:
  - File: src/components/Dashboard/StartDayButton.tsx
  - Test: src/components/Dashboard/StartDayButton.test.tsx
  - Styles: src/components/Dashboard/StartDayButton.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useDay, @/hooks/useTemplates, @/hooks/useSettings, @/repositories/startNewDay
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## EndOfDayCard
- Page: Dashboard
- Dependencies: StartDayButton
- Hook: useEvents
- Complexity: low
- Build config:
  - File: src/components/Dashboard/EndOfDayCard.tsx
  - Test: src/components/Dashboard/EndOfDayCard.test.tsx
  - Styles: src/components/Dashboard/EndOfDayCard.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useEvents
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

---

## Timeline

## DurationBlock
- Page: Timeline
- Dependencies: none
- Hook: none (props in)
- Complexity: medium
- Build config:
  - File: src/components/Timeline/DurationBlock.tsx
  - Test: src/components/Timeline/DurationBlock.test.tsx
  - Styles: src/components/Timeline/DurationBlock.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/domain (formatTimeForDisplay)
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## PointMarker
- Page: Timeline
- Dependencies: none
- Hook: none (props in)
- Complexity: medium
- Build config:
  - File: src/components/Timeline/PointMarker.tsx
  - Test: src/components/Timeline/PointMarker.test.tsx
  - Styles: src/components/Timeline/PointMarker.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/domain (formatTimeForDisplay)
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## TimelineList
- Page: Timeline
- Dependencies: DurationBlock, PointMarker, CurrentTimeIndicator
- Hook: useEvents (composes engine `projectDay`)
- Complexity: medium
- Build config:
  - File: src/components/Timeline/TimelineList.tsx
  - Test: src/components/Timeline/TimelineList.test.tsx
  - Styles: src/components/Timeline/TimelineList.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useEvents, @/hooks/useDay, @/hooks/useSettings, @/hooks/useTemplates, @/domain
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

---

## Tomorrow Plan

## TomorrowForm
- Page: Tomorrow
- Dependencies: OwnerPicker, EventEditDrawer (for extras)
- Hook: useDay, useTemplates, useSettings, useEvents
- Complexity: high
- Build config:
  - File: src/components/Tomorrow/TomorrowForm.tsx
  - Test: src/components/Tomorrow/TomorrowForm.test.tsx
  - Styles: src/components/Tomorrow/TomorrowForm.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useDay, @/hooks/useTemplates, @/hooks/useSettings, @/hooks/useEvents
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## TomorrowPreview
- Page: Tomorrow
- Dependencies: TimelineList
- Hook: useSettings, useTemplates (calls `projectDay` against tomorrow's planned data)
- Complexity: medium
- Build config:
  - File: src/components/Tomorrow/TomorrowPreview.tsx
  - Test: src/components/Tomorrow/TomorrowPreview.test.tsx
  - Styles: src/components/Tomorrow/TomorrowPreview.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useSettings, @/hooks/useTemplates, @/domain
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## PromoteTomorrowButton
- Page: Tomorrow
- Dependencies: ConfirmDialog
- Hook: uses startNewDay repo + useDay
- Complexity: low
- Build config:
  - File: src/components/Tomorrow/PromoteTomorrowButton.tsx
  - Test: src/components/Tomorrow/PromoteTomorrowButton.test.tsx
  - Styles: src/components/Tomorrow/PromoteTomorrowButton.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/repositories/startNewDay, @/hooks/useDay
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

---

## History

## HistoryDayCard
- Page: History
- Dependencies: none
- Hook: none (props in)
- Complexity: low
- Build config:
  - File: src/components/History/HistoryDayCard.tsx
  - Test: src/components/History/HistoryDayCard.test.tsx
  - Styles: src/components/History/HistoryDayCard.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/domain (formatTimeForDisplay)
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## HistoryList
- Page: History
- Dependencies: HistoryDayCard, EmptyState
- Hook: archived-days repository call (new helper to add: `listArchivedDays(db, childId, limit=7)`)
- Complexity: low
- Build config:
  - File: src/components/History/HistoryList.tsx
  - Test: src/components/History/HistoryList.test.tsx
  - Styles: src/components/History/HistoryList.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/repositories/days
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## ArchivedDayView
- Page: History
- Dependencies: TimelineList
- Hook: useEvents (read-only mode)
- Complexity: low
- Build config:
  - File: src/components/History/ArchivedDayView.tsx
  - Test: src/components/History/ArchivedDayView.test.tsx
  - Styles: src/components/History/ArchivedDayView.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useEvents
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

---

## Settings

## WakeWindowsEditor
- Page: Settings
- Dependencies: none
- Hook: useSettings (read+save)
- Complexity: medium
- Build config:
  - File: src/components/Settings/WakeWindowsEditor.tsx
  - Test: src/components/Settings/WakeWindowsEditor.test.tsx
  - Styles: src/components/Settings/WakeWindowsEditor.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useSettings, @/repositories/settings
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## NapDefaultsEditor
- Page: Settings
- Dependencies: none
- Hook: useSettings
- Complexity: low
- Build config:
  - File: src/components/Settings/NapDefaultsEditor.tsx
  - Test: src/components/Settings/NapDefaultsEditor.test.tsx
  - Styles: src/components/Settings/NapDefaultsEditor.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useSettings, @/repositories/settings
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## BottleRulesEditor
- Page: Settings
- Dependencies: ConfirmDialog
- Hook: useSettings
- Complexity: medium
- Build config:
  - File: src/components/Settings/BottleRulesEditor.tsx
  - Test: src/components/Settings/BottleRulesEditor.test.tsx
  - Styles: src/components/Settings/BottleRulesEditor.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useSettings, @/repositories/settings
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## DreamFeedEditor
- Page: Settings
- Dependencies: none
- Hook: useSettings
- Complexity: low
- Build config:
  - File: src/components/Settings/DreamFeedEditor.tsx
  - Test: src/components/Settings/DreamFeedEditor.test.tsx
  - Styles: src/components/Settings/DreamFeedEditor.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useSettings, @/repositories/settings
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## PumpTimesEditor
- Page: Settings
- Dependencies: none
- Hook: useSettings
- Complexity: low
- Build config:
  - File: src/components/Settings/PumpTimesEditor.tsx
  - Test: src/components/Settings/PumpTimesEditor.test.tsx
  - Styles: src/components/Settings/PumpTimesEditor.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useSettings, @/repositories/settings
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## WeekendTemplateEditor
- Page: Settings
- Dependencies: OwnerPicker, ConfirmDialog
- Hook: useTemplates (+ saveTemplate from repo)
- Complexity: medium
- Build config:
  - File: src/components/Settings/WeekendTemplateEditor.tsx
  - Test: src/components/Settings/WeekendTemplateEditor.test.tsx
  - Styles: src/components/Settings/WeekendTemplateEditor.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useTemplates, @/repositories/templates, @/domain (flipTemplate, copyToOtherDay)
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## SettingsAccount
- Page: Settings
- Dependencies: none
- Hook: useAuth
- Complexity: low
- Build config:
  - File: src/components/Settings/SettingsAccount.tsx
  - Test: src/components/Settings/SettingsAccount.test.tsx
  - Styles: src/components/Settings/SettingsAccount.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/lib/auth/useAuth
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

---

## Pages (compose components into routes)

Build pages last after all their components ship.

## DashboardPage
- Page: Dashboard
- Dependencies: AppShell, NextEventCard, NextBottlePreview, NextNapPreview, CurrentWakeWindowStatus, StartBottleButton, NapActionButton, StartDayButton, EndOfDayCard, FAB, EventEditDrawer
- Hook: useDay, useEvents, useSettings, useTemplates
- Complexity: medium
- Build config:
  - File: src/app/(authed)/page.tsx
  - Test: src/app/(authed)/page.test.tsx
  - Styles: src/app/(authed)/page.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/*, @/domain
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## TimelinePage
- Page: Timeline
- Dependencies: AppShell, TimelineList, FAB, EventEditDrawer
- Hook: useEvents, useDay, useSettings, useTemplates
- Complexity: low
- Build config:
  - File: src/app/(authed)/timeline/page.tsx
  - Test: src/app/(authed)/timeline/page.test.tsx
  - Styles: src/app/(authed)/timeline/page.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/*
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## TomorrowPage
- Page: Tomorrow
- Dependencies: AppShell, TomorrowForm, TomorrowPreview, PromoteTomorrowButton
- Hook: useDay, useEvents, useTemplates, useSettings
- Complexity: low
- Build config:
  - File: src/app/(authed)/tomorrow/page.tsx
  - Test: src/app/(authed)/tomorrow/page.test.tsx
  - Styles: src/app/(authed)/tomorrow/page.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/*
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## HistoryPage
- Page: History
- Dependencies: AppShell, HistoryList
- Hook: archived-days fetch
- Complexity: low
- Build config:
  - File: src/app/(authed)/history/page.tsx
  - Test: src/app/(authed)/history/page.test.tsx
  - Styles: src/app/(authed)/history/page.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/repositories/days
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## ArchivedDayPage
- Page: History
- Dependencies: AppShell, ArchivedDayView
- Hook: useEvents (with day-specific dayId from route param)
- Complexity: low
- Build config:
  - File: src/app/(authed)/history/[date]/page.tsx
  - Test: src/app/(authed)/history/[date]/page.test.tsx
  - Styles: src/app/(authed)/history/[date]/page.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/useEvents, @/repositories/days
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

## SettingsPage
- Page: Settings
- Dependencies: AppShell, WakeWindowsEditor, NapDefaultsEditor, BottleRulesEditor, DreamFeedEditor, PumpTimesEditor, WeekendTemplateEditor, SettingsAccount
- Hook: useSettings, useTemplates, useAuth
- Complexity: low
- Build config:
  - File: src/app/(authed)/settings/page.tsx
  - Test: src/app/(authed)/settings/page.test.tsx
  - Styles: src/app/(authed)/settings/page.module.css
  - Test utilities: src/test-utils.ts
  - Hook imports: @/hooks/*, @/lib/auth/useAuth
  - Test runner: vitest
  - CSS approach: CSS Modules
  - Token file: src/styles/tokens.css
- Build status: [ ] not started

---

## Build wave dependency order (suggested for /build-pipeline)

**Wave 0 — palette + test utils**
- `tokens.css` rewrite (Theme A earth-tone palette + dark mode CSS-variable structure)
- `src/test-utils.ts` (RTL render with mocked AuthProvider + hook mocks)

**Wave 1 — leaf shared components (no deps)**
SyncStatusIcon, OwnerPicker, ConfirmDialog, EmptyState, LoadingState, FAB, BottomTabs, CurrentTimeIndicator, KebabMenu

**Wave 2 — composed shared**
Header (uses SyncStatusIcon), AppShell (uses Header + BottomTabs + KebabMenu), EventEditDrawer (uses OwnerPicker + ConfirmDialog)

**Wave 3 — Dashboard leaves**
NextEventCard, NextBottlePreview, NextNapPreview, CurrentWakeWindowStatus, StartBottleButton, NapActionButton, StartDayButton, EndOfDayCard

**Wave 4 — Timeline**
DurationBlock, PointMarker, TimelineList (uses DurationBlock + PointMarker + CurrentTimeIndicator)

**Wave 5 — Tomorrow**
TomorrowPreview (uses TimelineList), TomorrowForm (uses OwnerPicker + EventEditDrawer), PromoteTomorrowButton

**Wave 6 — History**
HistoryDayCard, HistoryList, ArchivedDayView (uses TimelineList)

**Wave 7 — Settings**
WakeWindowsEditor, NapDefaultsEditor, BottleRulesEditor, DreamFeedEditor, PumpTimesEditor, WeekendTemplateEditor, SettingsAccount

**Wave 8 — Pages**
DashboardPage, TimelinePage, TomorrowPage, HistoryPage, ArchivedDayPage, SettingsPage

**Wave 9 — Integration**
PWA manifest + service worker, E2E tests for critical flows (Start Bottle Now, Start Nap/End Nap, Start New Day, Promote Tomorrow), `/design-audit` + `/visual-qa` passes.
