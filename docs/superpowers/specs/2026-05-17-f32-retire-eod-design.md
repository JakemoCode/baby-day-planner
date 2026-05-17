# §F32 — Retire `EndOfDayCard`; reshape dashboard around always-visible panels

> Status: design (pending implementation plan)
> Source: `docs/v3/FAST_FOLLOW.md` §F32 (2026-05-16)
> Grilling session: 2026-05-17

## Goal

Two coupled changes:

1. **Retire `EndOfDayCard`.** Remove both early-return branches in
   `src/app/(authed)/page.tsx` — the wake-gate branch (no day yet) and
   the end-of-day branch (`!nextEvent && nowMinutes >= bedtimeThreshold`).
   The dashboard should never collapse to a single dead-end card.
2. **Reshape dashboard panels** so per-day stats are always visible.
   Bottle and sleep panels carry their own totals; the wake-window
   banner doubles as an in-progress-sleep banner.

## Out of scope

- Pumps (deferred from dashboard v1; still on timeline).
- §F3 onboarding / §F10 child name+DOB (separate fast-follows).
- Real "record actual wake time" semantics for the wake-up CTA
  (relabel only; behavior unchanged).
- Time-formatting house-style cleanup (mix of `Xm ago` / `X min ago`
  exists today; keep mixed for this PR).

## Final dashboard composition

In render order:

1. **`NowBanner`** (renamed from `CurrentWakeWindowStatus`) — single
   slot, content swaps based on baby state:
   - In wake window: `In wake window N`
   - Nap in progress: `Nap in progress — 47 min`
   - Bedtime in progress: `Bedtime in progress — 1h 12m`
   These states are mutually exclusive; the cascade guarantees the
   wake window starts immediately after a nap ends, so there's no
   render gap.
2. **`NextEventCard`** — see §A below.
3. **`NextBottlePanel`** (renamed from `NextBottlePreview`) — §C.
4. **`NextSleepPanel`** (renamed from `NextNapPreview`) — §D.
5. **Action row** — `StartBottleButton` + `NapActionButton`
   + `StartDayButton` *(dev-only, gated on
   `process.env.NODE_ENV === "development"`)*.
6. **FAB**.

When no day exists (wake gate): slim `Wake up` banner top, body blank
(see §E).

## §A — `NextEventCard`

**Vocabulary**: only `bottle`, `nap`, `bedtime`. Filter out
`wake_window` and `pump` from the candidate set.

**Source**: continues reading from `projected` via the `nextEvent`
selector (no change to data source — vocabulary is the only filter).

**Putdown rendering**: when next event is `nap` or `bedtime`, render
a derived sub-line `Putdown HH:MM` where putdown =
`startTime − putdownLeadMinutes`. Computed inline in the component;
no engine change.

**In-progress sleep handling**: when an in-progress nap or bedtime
exists (detected via `isInProgress(e, defaultNapLengthMinutes, now)`
as on page.tsx:137–142), the next-event selector should skip past
the in-progress sleep's `endTime` so the card shows what's *after*
the sleep. The in-progress sleep itself is announced by `NowBanner`.

**End-of-day empty state**: when `nextEvent` returns undefined
(typical past-bedtime case once the early-return is gone), render:
`No more events — have a good night`. Panels still render below.

## §B — `NowBanner`

Replaces `CurrentWakeWindowStatus`. Content selector (in priority
order):

1. If in-progress bedtime: `Bedtime in progress — {elapsed}`
2. Else if in-progress nap: `Nap in progress — {elapsed}`
3. Else if `currentWakeWindow(projected, now)`: existing wake-window
   copy (`In wake window N`).
4. Else: render nothing (edge case; shouldn't normally hit).

Elapsed = `now - startTime`, formatted via existing
`formatHoursMinutes` helper.

Banner is in-flow (not sticky). Same vertical slot regardless of
state.

## §C — `NextBottlePanel`

Always renders (drop existing `hideBottlePreview` suppression).
Lines (in order, each may be hidden independently):

1. **Next bottle**: `Next bottle: {time} {OwnerPill}`.
   Hide if `nextBottle(projected, now)` is undefined.
2. **Based on last bottle**: `Based on last bottle: {oz}oz,
   {minutesAgo} min ago ({time})`.
   - Hide if no recorded bottle exists today.
   - Time format: `formatTimeShort` ("12:42p").
3. **Today's totals**: `Today: {N} bottles, {sumOz}oz`.
   - Count `actuals.filter(e => e.type === "bottle" && isRecorded(e.lifecycle))`.
   - Sum `amountOz` across the same set.
   - Always renders (even at 0/0; provides "no bottles yet today"
     signal).

Owner pill rendering follows existing convention.

## §D — `NextSleepPanel`

Always renders (drop existing `hideNapPreview` suppression).
Lines (in order, each may be hidden independently):

1. **Next sleep (paired)**: `Putdown {time} → Nap {time} {OwnerPill}`.
   - Hide if no next projected nap.
   - Putdown computed inline (nap.startTime − putdownLeadMinutes).
2. **Based on last nap**: `Based on last nap: {duration}, {minutesAgo}
   min ago ({endTime as TimeShort})`.
   - Hide if no completed nap today.
   - `minutesAgo` relative to nap end.
3. **Today's nap totals**: `Today: {N} naps, {sumMinutes}`.
   - Count + sum across recorded naps. Use raw `endTime` (not
     `effectiveEndOf`) for totals — keeps math simple; in-progress
     nap's live duration is already shown by `NowBanner`.
4. **Projected bedtime**: `Projected bedtime: {time}`.
   - Hide only if `projectedBedtime(projected)` is undefined
     (shouldn't happen in normal flow).
   - Bedtime is NOT counted in nap totals.

## §E — Wake gate (no day yet)

Replace the full-bleed `EndOfDayCard afterMidnight` at page.tsx:111
with a slim inline `Wake up` CTA at top.

- Single `Wake up` button (relabel of today's `StartDayButton`).
- Handler: identical to today's `handleStart` (page.tsx:90) —
  bootstraps settings if needed, then `startNewDay` anchored at
  `settings.defaultWakeTime ?? DEFAULT_WAKE_TIME`.
- No heading or surrounding copy (the empty dashboard below is the
  implicit "nothing to show yet" signal).

Below the banner: blank. No panels render (no day to anchor them).
The dashboard wrapper's `styles.page` should accommodate a banner-only
layout without forcing a full-height empty canvas.

## §F — End-of-day branch removal

Delete the `if (isEndOfDay) { return <EndOfDayCard … /> }` block
(page.tsx:120–132). Dashboard renders normally past `bedtimeThreshold`:

- `NowBanner` continues to show the active wake window (until bedtime
  starts).
- `NextEventCard` shows `No more events — have a good night` once
  there's no `next`.
- Panels show today's totals as the focal stats.
- `NapActionButton` already falls back to "Start Bedtime Now" past
  threshold (post-PR #168), keeping bedtime startable.
- `StartBottleButton` remains actionable (legitimate to bottle past
  bedtime).

## §G — Action row

Two visible buttons in production:
- `StartBottleButton`
- `NapActionButton`

One dev-only button:
- `StartDayButton` rendered iff
  `process.env.NODE_ENV === "development"`. Useful for click-testing.
  Hidden in production builds (Next.js inlines `NODE_ENV` at compile
  time so the branch dead-code-eliminates).

## §H — Files touched

**New / renamed**:
- `src/v3/components/Dashboard/NowBanner.tsx` (rename of
  `CurrentWakeWindowStatus.tsx`, extended)
- `src/v3/components/Dashboard/NextBottlePanel.tsx` (rename of
  `NextBottlePreview.tsx`, reshaped)
- `src/v3/components/Dashboard/NextSleepPanel.tsx` (rename of
  `NextNapPreview.tsx`, reshaped)

**Modified**:
- `src/app/(authed)/page.tsx` — remove both early returns, drop
  suppression flags, update imports
- `src/v3/components/Dashboard/NextEventCard.tsx` — filter vocab,
  add putdown sub-line, add end-of-day empty copy, skip in-progress
  sleep

**Deleted**:
- `src/v3/components/Dashboard/EndOfDayCard.tsx`
- `src/v3/components/Dashboard/EndOfDayCard.module.css`
- `src/v3/components/Dashboard/EndOfDayCard.test.tsx`

## §I — Testing

Per workspace `testing.md` and `feedback_seam_coverage_required.md`:

- **Unit tests** per panel — feed realistic `actuals` and assert
  rendered text per state matrix:
  - No data (fresh day)
  - Mid-day with prior recorded events
  - Past bedtime threshold with full day's events
  - In-progress sleep (banner-side)
- **Seam test**: one integration test that mounts the dashboard with
  REAL `projectDay` + REAL `renderProjection` + REAL selectors over a
  realistic `actuals` stream. Assert:
  - `NowBanner` switches content when an in-progress nap actual is
    introduced.
  - Panels show correct cumulative totals.
  - `NextEventCard` skips the in-progress sleep correctly.
- **Migration / contamination**: no write-path changes. No
  contaminated-data section needed.

## §J — Layout density (non-functional)

Hard constraint: dashboard must not require scrolling on the dev
iPhone viewport in the normal-state case (active wake window,
mid-day, all panels populated).

Approach: build at existing card density (current padding/typography
tokens). After implementation, screenshot at standard mobile widths
and compact via padding tokens if necessary, in the same PR. Do not
pre-optimize.

## Acceptance

- No `EndOfDayCard` import remains in `src/app/(authed)/page.tsx`.
- `EndOfDayCard.*` files deleted.
- Wake-gate state renders the slim "Wake up" banner only.
- At 11 PM with bedtime completed: dashboard shows
  `NowBanner` (wake window or empty), `NextEventCard` ("No more
  events"), `NextBottlePanel` (today's totals), `NextSleepPanel`
  (today's totals + projected bedtime), action row. No "Day Complete"
  lockout.
- In-progress nap: `NowBanner` shows live elapsed counter;
  `NextEventCard` shows what's after the nap.
- All panels render even when their event type is "next" (no
  suppression).
- `StartDayButton` hidden in production builds; visible in dev.
- 639+ unit tests still pass; new tests added for the per-panel state
  matrix and one dashboard-seam integration test.

## Implementation sequencing (high level — full plan to follow)

Roughly in dependency order:
1. Rename + extend `CurrentWakeWindowStatus` → `NowBanner`.
2. Reshape `NextBottlePreview` → `NextBottlePanel`.
3. Reshape `NextNapPreview` → `NextSleepPanel`.
4. Update `NextEventCard` vocab filter + putdown sub-line +
   in-progress skip + empty-state copy.
5. Slim wake-gate banner; remove both early returns; gate
   `StartDayButton` on dev.
6. Delete `EndOfDayCard.*`.
7. Seam test.

Each step is independently mergeable. Detailed plan follows in
`writing-plans`.
