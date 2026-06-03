# Baby Day Planner — UI Requirements

> Source: PRD at `/Users/jakemosher/Workspace/docs/private_baby_day_planner_v1_prd.md` + interview decisions captured 2026-05-05.
> Engine: `src/v3/engine/`. Data layer: `src/v3/repositories/` + `src/v3/hooks/`. Schema: `src/v3/schemas.ts`.

## Pages and routes

| Route | Purpose | Auth |
|---|---|---|
| `/sign-in` | Google sign-in (only allowlisted emails) | public |
| `/` | Dashboard (default after sign-in) | authed |
| `/timeline` | Today's full vertical timeline | authed |
| `/tomorrow` | Tomorrow Plan editor + preview | authed |
| `/history` | Last 7 archived days list | authed |
| `/history/[date]` | One archived day, read-only timeline | authed |
| `/settings` | All configurable settings | authed |

Sign-in flow + `(authed)` layout already shipped in Plan B.

## Global layout

- **Persistent header**: `Aden's Day · Mon, May 5` + sync status icon (tap to refresh)
- **Bottom navigation**: 3 tabs (Dashboard, Timeline, Tomorrow) + kebab menu (History, Settings, Sign out)
- **No sidebar.** Mobile-first PWA.

## Visual + UX system

- **Theme**: calm pastels with earth-tone preference — sage, terracotta, warm cream, dusty blue. Light default, optional dark mode.
- **Touch targets**: spacious (≥44pt). Generous padding throughout. Less data per screen.
- **Time format**: `9:35 AM` / `4:23 PM` (no leading zero). Format helper: `formatTimeForDisplay` in `@/domain`.
- **Oz format**: drop trailing zero — `5 oz`, `5.5 oz`.
- **Owner colors** (tinted backgrounds for nap/wake-window cards):
  - Jake: dusty blue
  - Kelly: warm pink/coral
  - Daycare: neutral gray
- **Empty state voice**: calm + minimal. Examples: "No bottles yet — start the first one when ready", "Have a good night" (post-bedtime).
- **Action feedback**: silent UI. New card appearing IS the feedback. Toasts only for errors.
- **Touch interactions**: pure tap only. No long-press, no swipe, no pull-to-refresh.
- **Confirmation dialogs**: only for destructive actions — Start New Day (archives current), delete actual event, delete extra event. Everything else: explicit Save button = confirm.

## Page details

### Dashboard (`/`)

**Purpose:** Primary view answering "what happens next, and how did the latest bottle/nap change today?"

**Components / data:**
- **NextEventCard** — primary card showing next non-wake-window event with current owner if assigned
  - Hook: `useDay`, `useEvents`, `useSettings`. Engine selector: `nextEvent(events, nowMinutes)`
  - Display: label + time (e.g., `Start putting down for Nap 2 · 9:30 AM · in 12 min`)
- **NextBottlePanel** _(was `NextBottlePreview`; renamed + reshaped in §F32 2026-05-17)_ — secondary card. Selector: `nextBottle`; adds per-day bottle totals.
- **NextSleepPanel** _(was `NextNapPreview`; renamed + reshaped in §F32 2026-05-17)_ — secondary card. Selector: `nextNap`; adds per-day nap totals.
- **NowBanner** _(was `CurrentWakeWindowStatus`; renamed + extended in §F32 2026-05-17)_ — wake-window + in-progress sleep banner. Priority: bedtime > nap > wake-window.
- **Action buttons (context-aware):**
  - **ContextualActionButton** — single multi-mode button: "End Nap" during an in-progress nap, "Log bottle now" within ±15min of a projected bottle, "End overnight sleep" for the morning wake; hidden otherwise. Replaced the per-action "Start Nap/Bottle Now" buttons (ADR-0001, ADR-0003); everything else auto-promotes at Now-cross (ADR-0006).
  - **StartDayButton** — context-aware label: "Start New Day" if no Tomorrow Plan, "Start Day from Plan" if one exists. Kebab override: "Start blank instead". Settings toggle: "Always promote Tomorrow Plan if one exists".
  - **FAB (+)** — opens EventEditDrawer in "create extra" mode
- **EndOfDayCard** — _(retired in §F32 2026-05-17; see `docs/v3/FAST_FOLLOW_COMPLETED.md` §F32)_ Previously replaced primary card after dream feed completes. Dashboard now always shows stats; wake gate replaced with a slim "Wake up" CTA.

**Empty states:**
- No Bottle 1 logged: NextBottlePanel shows totals at 0 ("Today: 0 bottles, 0oz") with no "based on last" line
- Wake time not set: header instructs "Set wake time to start the day"

### Timeline (`/timeline`)

**Purpose:** Full vertical day view. Tap any event → EventEditDrawer.

**Components:**
- **YesterdayLink** — top-of-page back-nav: "← Yesterday" → `/history/[yesterday-date]`. No forward nav (timeline is today).
- **TimelineList** — scrollable vertical axis with current time indicator if practical
- **DurationBlock** — for naps, wake windows, extras with end time
- **PointMarker** — for wake, bottle, putdown, pump, bedtime, dream feed, extras without end time

**Visual states (timeline + drawer):**
| State | Treatment |
|---|---|
| Projected | Soft fill, dashed/light border |
| Actual | Solid fill, full opacity |
| Overridden / manual edit | Solid + small ✎ mark |
| Completed | Checkmark |
| Moved-due-to-overlap | Small arrow icon |
| Template-assigned-owner | Subtle owner-color tint vs. solid for explicit owner |

### EventEditDrawer (shared component, bottom sheet)

**Purpose:** Edit any event from Dashboard or Timeline. Type-aware fields.

| Event type | Fields |
|---|---|
| `bottle` | Start time · Amount oz (default from settings, editable any time, edit cascades chain projection) · Owner |
| `nap` | Start time · End time · Owner. Editing influences neighboring wake windows; **does not** retroactively shift the projected putdown indicator. |
| `wake_window` | Owner only (duration is derived). |
| `extra` | Label · Start time · Optional end time · Optional owner. |
| `pump` | Start time. |

**UX:** Explicit Save + Cancel buttons. Delete button (with confirm) for actual/manual events. Read-only mode in `/history/[date]` with small Edit affordance per event.

### Tomorrow Plan (`/tomorrow`)

**Purpose:** Plan tomorrow's day, weekend especially.

**Components:**
- **TomorrowForm** — fields:
  - Expected wake time (default from settings)
  - Optional expected Bottle 1 time (else stays pending until started)
  - Ownership template selection (auto-applies weekend template if tomorrow is Sat/Sun; weekday: blank, user picks or none)
  - Extra events list (FAB to add)
- **TomorrowPreview** — read-only render of `projectDay()` output for tomorrow's planned data. Reuses TimelineList.
- **PromoteTomorrowButton** — "Promote tomorrow to today" (alternative to Dashboard's StartDayButton).

**Promotion:** When promoted, lands on **Dashboard**. Preserves owners, extras, optional Bottle 1 time. Bottle 1 stays pending until actually started.

### History (`/history`)

**Purpose:** List of last 7 archived days.

**Components:**
- **HistoryList** — vertical list of HistoryDayCards
- **HistoryDayCard** — date + summary (e.g., "Sat, May 3 · 5 bottles · 4 naps") → tap → `/history/[date]`

### Archived day (`/history/[date]`)

**Purpose:** Read-only view of one past day.

**Components:**
- **ArchivedDayView** — wraps TimelineList in read-only mode. Per-event drawer opens with explicit Edit affordance to make a correction.

### Settings (`/settings`)

**Components:**
- **WakeWindowsEditor** — array of minutes (one per nap)
- **NapDefaultsEditor** — `defaultNapLengthMinutes`, `shortNapThresholdMinutes`, `shortNapAdjustmentMinutes`, `bedtimeThreshold`, `putdownLeadMinutes`
- **BottleRulesEditor** — `defaultBottleAmountOz`, `defaultBottleIntervalMinutes`, list of `BottleRule[]` (add/edit/delete, no reorder)
- **DreamFeedEditor** — `enabled` toggle + optional `time` hint. Time math removed post-simplification; dream feed is render-only (see `../_archive/v3/SIMPLIFICATION_SCOPE.md §3`).
- **PumpTimesEditor** — list of `"HH:MM"` strings
- **WeekendTemplateEditor** — Saturday + Sunday templates (nap owners[], wake-window owners[]). Flip Jake↔Kelly button. "Copy Sat → Sun flipped" button.
- **AlwaysPromotePlanToggle** — settings toggle for Tomorrow Plan auto-promotion behavior
- **SettingsAccount** — current user, sign out button

## Key flows

### Log a bottle (ADR-0001 / ADR-0003 / ADR-0006)
1. Within ±15min of a projected bottle, the ContextualActionButton shows "Log bottle now" → writes a recorded bottle at `startTime = now`, `amount = defaultBottleAmountOz`, overwriting that projected slot.
2. Otherwise (no manual tap), Now-cross auto-promote records the projected bottle at its projected time + default amount when the wall clock crosses it.
3. Engine cascades: `projectBottleChain` re-anchors from the recorded bottle, updating later projections.
4. Bottle time/amount editable from Timeline / drawer at any time; the edit cascades again.

### End Nap (ADR-0001 / ADR-0003 / ADR-0006)
1. Naps are never manually *started* — when Now crosses a projected nap's start, the engine auto-promotes it to `recorded` (in-progress).
2. During an in-progress nap, the ContextualActionButton shows "End Nap" → sets the nap's `endTime = now` (TIME_EDIT → `completed`).
3. Engine cascades: `applyNapActuals` re-anchors wake windows; short-nap rule fires if applicable.

### Start New Day / Start Day from Plan
1. User taps StartDayButton (label is context-aware based on Tomorrow Plan presence)
2. Confirm dialog: "Archive today and start fresh?"
3. `startNewDay` repository call:
   - Archives current active day
   - Creates new active day with wake time + (optional) ownership template from Tomorrow Plan
4. Lands on Dashboard

**Override:** kebab next to button → "Start blank instead" → bypasses Tomorrow Plan, uses generic Start New Day flow.

### Tomorrow Plan promotion
1. User taps PromoteTomorrowButton on `/tomorrow` OR auto-fires next morning if "Always promote" setting enabled
2. Same as Start Day from Plan flow above
3. Lands on Dashboard

### Add extra event
1. FAB (+) on Dashboard or Timeline
2. EventEditDrawer opens in "create extra" mode
3. User fills label + start + optional end + optional owner
4. Save → drawer closes → event appears on timeline (silent)

### Edit / delete event
1. Tap event on Timeline
2. EventEditDrawer opens in edit mode for that event type
3. Save commits via `updateEventOptimistic` from `useEvents`
4. Delete button (confirm dialog) commits via `deleteEventOptimistic`

## Test Specification

### Authentication
- Type: OAuth (Google) via Firebase Auth
- Provider: Firebase Auth (already wired in Plan B)
- Fixture setup: mock `useAuth` returning `{ status: "authorized", user: { email, uid } }` for component tests

### Data Layer
- Type: Firestore via repository hooks (`useSettings`, `useDay`, `useEvents`, `useTemplates`, `useSyncStatus`)
- Mock strategy: mock the hook in component tests; integration tests use Firebase emulator (already wired)
- Schema location: `src/v3/schemas.ts`

### Per-flow error scenarios
- **Start Bottle Now**: optimistic create succeeds locally; if Firestore write fails, optimistic state reverts on next watcher snapshot. UI shows red toast on error.
- **Start New Day**: transaction failure (rare) — error toast, day state unchanged.
- **Tomorrow promotion**: same as Start New Day.
- **Edit event**: optimistic update; on failure, watcher reverts; error toast.
- **Sign-in failure**: SignIn component already shows error message.
- **Offline**: Firestore caches mutations; UI shows offline indicator (sync icon turns gray); operations queue and flush on reconnect.

### Responsive behavior
- Mobile layout: single-column stack, bottom tabs, drawers from bottom
- Tablet layout: same as mobile (this is a PWA, primary device is phone)
- Desktop-only features: none (v1)
- Touch-specific interactions: none beyond tap

## Locked decisions / deferred work

- **Dark mode** — light only is the locked decision (see project memory). Tokens are CSS-variable-friendly via `tokens.css`; user-selectable themes are tracked in FAST_FOLLOW §F33.
- **Multi-child** — single hardcoded `NEXT_PUBLIC_DEFAULT_CHILD_ID=aden`. Data layer already supports `children/{childId}/...`. Onboarding + child picker tracked in FAST_FOLLOW §F10.
- **Staging environment** — separate Firebase project, deployed at distinct URL. Belongs in a deployment plan, not this doc.

## Decisions log

- Routes: clean paths per above
- EventEdit = bottom-sheet drawer, not full route
- Tomorrow promotion lands on Dashboard
- Bottom-only nav, 3 tabs + kebab
- Header content: title + date + sync icon
- No long-press/swipe/pull-to-refresh
- FAB for adding extras
- Silent UI for actions, error toasts only
- Calm minimal copy
- Spacious touch targets
- Theme A (calm pastels) with earth-tone preference
- Putdown is timing indicator only, never a button or actual
- "Start Putting Down" not a button, just informational copy in NextEventCard
