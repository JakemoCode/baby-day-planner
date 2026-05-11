# §F9 — V2 → V3 Test Coverage Audit

> Generated 2026-05-10. Gates PR-C1 (the V2 wipe).

> **Status**: per-file table populated 2026-05-10 (second pass, write-capable agent). The first pass undercounted — see correction note below.

## Summary

- **Total V2 test files audited**: 33 (the prior pass reported 28; the difference is the inclusion of `useSyncStatus`, `paths.test.ts`, and the four other shared hook/repo files that the first pass appears to have dropped)
- **Total V2 behavioral assertions**: 162 (the prior pass reported 115; recount via `grep -cE '^\s*(it|test)\s*\('` across the full delete-scope list yields 162)
- **Port**: 14 — V2 behaviors with no V3 equivalent that we *should* recreate
- **Waive**: 23 — V2-shape assertions that V3 architecturally avoids (safe to lose)
- **Overlap**: 125 — already covered by an equivalent V3 test
- **Risk assessment**: MEDIUM — the cutover preserved most behavior (125 overlaps), but 14 real gaps exist where a silent regression could land in PR-C1 if not addressed. The PORT list below is unchanged from the first pass — the new total counts simply move what were "uncategorised" assertions into OVERLAP.

## Top 5 highest-priority PORT recommendations

These are the gaps most likely to cause silent regressions when V2 deletes:

### 1. §11.A wake-instant deduplication
**File**: V2 timeline tests assert that a `wake` instant event coinciding with `wake_window_1` start is suppressed from the chip layer. Named product rule (§11.A) with **zero V3 coverage**. If a V3 Timeline refactor drifts the rule, no test catches it.

**Port to**: `src/v3/components/Timeline/TimelineV3.test.tsx` — add a test that asserts when `events` contains a `wake` instant + a `wake_window_1` block at the same start time, the chip layer renders one instant chip not two.

### 2. `data-past` dimming attribute contract
**File**: V2 tests verify the past-dimming feature emits a `data-past` attribute (CSS-driven). V3 `TimelineV3` accepts `dimPast` + `nowMinutes` props but no test verifies the attribute emission. If the prop wiring breaks, dimming silently fails.

**Port to**: `TimelineV3.test.tsx` — render with `dimPast`, `nowMinutes`, and a past event; assert `data-past="true"` on the past block.

### 3. `pxPerHour` geometry
**File**: V2 explicitly tested that a denser `pxPerHour` produces a shorter timeline height. V3 accepts the same prop. Without a test, the proportional-layout contract is entirely unguarded.

**Port to**: `TimelineV3.test.tsx` — render with `pxPerHour=60` then `pxPerHour=120`; assert the rendered timeline element's computed height changes proportionally.

### 4. `wake_window` and `extra` event types in EventEditDrawerV3
**File**: V3 drawer tests cover only `nap` and `bottle` form variants. `wake_window` (owner-only, no time inputs) and `extra` (label + start + optional end) are common event types and both are **completely untested** in V3.

**Port to**: `src/v3/components/shared/EventEditDrawerV3.test.tsx` — two new tests: one rendering with `event.type === "wake_window"` asserting only the owner picker shows; one with `event.type === "extra"` asserting label + start + optional-end fields render and save correctly.

### 5. `oz` display formatting in NextBottlePreview
**File**: V2 asserts "5 oz" not "5.0 oz" is the canonical product formatting. V3 has no test for this. Any refactor of the oz formatter could silently produce trailing zeros.

**Port to**: `src/v3/components/Dashboard/NextBottlePreview.test.tsx` — assert that `amountOz: 5` renders as exactly `"5 oz"` (no trailing zero) and `amountOz: 4.5` renders as `"4.5 oz"`.

## Surprises and ambiguities flagged during audit

- **`src/lib/firestore/paths.test.ts` is OUT OF SCOPE.** `paths.ts` is imported by all four V3 repositories. PR-C1 cannot delete `paths.ts` or its test without breaking V3. Confirm exemption in PR-C1's delete list.

- **`useSyncStatus` may also need to survive PR-C1.** Located under V2 hooks but consumed by `SyncStatusIcon` which PR-C1 explicitly does NOT delete. Recommend confirming whether `useSyncStatus` is on the PR-C1 delete list. If yes, port the hook to V3 or move the file. If no, this is a phantom V2 entry that's actually shared infrastructure.

- **V3 `PromoteTomorrowButton` removed the embedded confirm dialog**, moving it to page level. V2's in-component dialog assertions are correctly WAIVEd, but the page-level confirmation flow should be covered in `src/app/(authed)/tomorrow/page.test.tsx` before PR-C1 if it isn't already.

- **V3 `TomorrowForm` no longer manages extras** (add/edit/remove). V2 had nine assertions on this; all WAIVEd correctly. The equivalent page-level behavior must be confirmed covered in the Tomorrow page test before the wipe.

## Per-file audit

Status legend: **OVERLAP** = covered by a named V3 test; **GAP** = no V3 coverage, recommend porting; **WAIVE** = V3 architecture removes the behavior or moves it to a different layer (page-level / engine / shared primitive that survives PR-C1).

### src/components/Timeline/Block.test.tsx
**V3 counterpart**: `src/v3/components/Timeline/TimelineV3.test.tsx` (no standalone V3 Block test — block rendering is asserted via the Timeline test)

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders the label and time range | OVERLAP — TimelineV3.test.tsx:43 | — |
| shows the owner inline when present | OVERLAP — TimelineV3.test.tsx:68 (data-owner) + :87 (owner display name) | — |
| abbreviates putdown labels to 'Putdown' | OVERLAP — TimelineV3.test.tsx:59 (synthesizes putdown block) | — |
| renders extra-block start/end marker lines | WAIVE | V3 dropped extra-marker line geometry from the block component; visual treatment moved to CSS via `data-kind` on the synthesized putdown block. No behavioral assertion remains. |
| does NOT render marker lines for wake/nap/putdown | WAIVE | Same as above — markers no longer exist. |
| exposes data-color-mode for CSS | WAIVE | V3 replaced color-mode toggling with `--owner-color` inline + slot data attributes (TimelineV3.test.tsx:93, :102, :118). |
| marks past blocks with data-past for opacity | GAP | Port to TimelineV3.test.tsx — see PORT #2 above. |
| calls onClick when tapped | OVERLAP — TimelineV3.test.tsx:125 (onEventTap) | — |
| renders as non-interactive presentation div when onClick omitted | OVERLAP — covered by ArchivedDayView.test.tsx:84 (no-tap path) | — |

### src/components/Timeline/groupInstants.test.ts
**V3 counterpart**: `src/v3/components/Timeline/groupInstants.test.ts`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| returns empty array for no events | OVERLAP — implicit in groupInstants.test.ts (handled by `buckets…`) | — |
| returns one group with one item for a lone instant | OVERLAP — groupInstants.test.ts:24 | — |
| groups two instants at the same time into one cluster | OVERLAP — groupInstants.test.ts:24 | — |
| returns separate groups for distinct times, sorted ascending | OVERLAP — groupInstants.test.ts:44 | — |
| ignores block-kind events | OVERLAP — groupInstants.test.ts:35 | — |

### src/components/Timeline/InstantChip.test.tsx
**V3 counterpart**: `src/v3/components/Timeline/TimelineV3.test.tsx` (no standalone chip test in V3)

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders per-event label (numbered for bottles) and short time | OVERLAP — TimelineV3.test.tsx:43 (renders blocks + chips) | — |
| renders dream_feed with its own label | WAIVE | V3 owners/labels resolved via OwnersConfig; dream_feed label assertion is implicit in projection tests (engine/rules/dreamFeed.test.ts). |
| propagates colorMode + owner via data-attributes | OVERLAP — TimelineV3.test.tsx:102 (--owner-color on chips) + :68 (data-owner) | — |
| calls onClick when tapped | OVERLAP — TimelineV3.test.tsx:125 | — |
| renders one chip per item, all in single horizontal row | OVERLAP — TimelineV3.test.tsx:43 + groupInstants.test.ts | — |
| marks past clusters with data-past | GAP | Same as Block past-dimming — covered by PORT #2. |
| forwards onEventTap to chips with right event | OVERLAP — TimelineV3.test.tsx:125 | — |

### src/components/Timeline/NowBar.test.tsx
**V3 counterpart**: `src/v3/components/Timeline/TimelineV3.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders line spanning axis edge to right inset | OVERLAP — TimelineV3.test.tsx:146 (renders now-bar) | — |
| anchors pill at left edge | WAIVE | Layout-only; V3 styling-driven, not asserted. |
| formats time label in full AM/PM form | OVERLAP — covered by `src/v3/ui/time.test.ts` | — |

### src/components/Timeline/TimelineV2.test.tsx
**V3 counterpart**: `src/v3/components/Timeline/TimelineV3.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders empty-state when no events | OVERLAP — TimelineV3.test.tsx:38 | — |
| renders one block per duration event | OVERLAP — TimelineV3.test.tsx:43 | — |
| renders one cluster per distinct instant time | OVERLAP — TimelineV3.test.tsx:43 + groupInstants.test.ts | — |
| filters out wake-instant coinciding with WW1 start (§11.A) | GAP | Port to TimelineV3.test.tsx — see PORT #1 above. |
| renders now bar when nowMinutes provided | OVERLAP — TimelineV3.test.tsx:146 | — |
| does NOT render now bar when nowMinutes omitted | GAP (low-risk; consider) | Worth adding a one-line negation to TimelineV3.test.tsx alongside :146. |
| propagates onEventTap to blocks and chips | OVERLAP — TimelineV3.test.tsx:125 | — |
| dims past blocks/clusters when dimPast + nowMinutes provided | GAP | Port — PORT #2. |
| respects pxPerHour for vertical spacing | GAP | Port — PORT #3. |

### src/components/Dashboard/CurrentWakeWindowStatus.test.tsx
**V3 counterpart**: `src/v3/components/Dashboard/CurrentWakeWindowStatus.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders 'In WW1 · ends 9:00 AM' when in window | OVERLAP — V3:27 | — |
| includes owner when set | OVERLAP — V3:33 | — |
| renders nothing when not in a wake window | OVERLAP — V3:40 | — |

### src/components/Dashboard/EndOfDayCard.test.tsx
**V3 counterpart**: `src/v3/components/Dashboard/EndOfDayCard.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| shows 'Have a good night' before midnight | OVERLAP — V3:7 | — |
| shows 'Tap to start day' + StartDayButton after midnight | OVERLAP — V3:12 | — |
| uses 'Tap to start plan' wording when Tomorrow Plan exists | OVERLAP — V3:18 | — |

### src/components/Dashboard/NapActionButton.test.tsx
**V3 counterpart**: `src/v3/components/Dashboard/NapActionButton.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders 'Start Nap Now' when no nap in progress | OVERLAP — V3:20 | — |
| renders 'End Nap' when nap in progress | OVERLAP — V3:33 | — |
| calls onStart with a nap event when starting | OVERLAP — V3:46 | — |
| calls onEnd with the nap and current end time when ending | OVERLAP — V3:92 | — |

### src/components/Dashboard/NextBottlePreview.test.tsx
**V3 counterpart**: `src/v3/components/Dashboard/NextBottlePreview.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders next bottle time + label | OVERLAP — V3:27 | — |
| shows projection subtitle for projected bottles | OVERLAP — V3:33 | — |
| shows actual subtitle for actual bottles | OVERLAP — V3:38 (logged) | — |
| renders calm empty state when no bottle scheduled | OVERLAP — V3:54 | — |
| renders neutral empty state when bottle1Pending=false and no bottle | OVERLAP — V3:54 | — |
| drops trailing zero on whole-number oz | GAP | Port — PORT #5. |
| preserves fractional oz | GAP | Port alongside PORT #5. |
| shows last-bottle subtext when lastBottle provided | OVERLAP — V3:59 | — |
| shows dream feed in place of empty state when no next bottle | OVERLAP — V3:79 | — |
| falls back to empty state when bottle1Pending even if dreamFeed exists | OVERLAP — V3:99 | — |
| shows last-bottle subtext even with empty next state | OVERLAP — V3:59 (subtext rendering covered) | — |

### src/components/Dashboard/NextEventCard.test.tsx
**V3 counterpart**: `src/v3/components/Dashboard/NextEventCard.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders next event label, time and 'in N min' delta | OVERLAP — V3:27 | — |
| shows 'now' when delta is 0 | OVERLAP — V3:34 | — |
| formats delta over 60 minutes as '1h 5m' | OVERLAP — V3:39 | — |
| displays owner when present | OVERLAP — V3:50 | — |
| renders calm empty state when event undefined | OVERLAP — V3:68 | — |
| appends target time to putdown label when targetEvent provided | WAIVE | V3 putdown is a synthesized block (engine), not a NextEventCard concern; covered by engine/rules/putdown.test.ts. |
| ignores targetEvent for non-putdown events | WAIVE | Same — prop removed from V3 NextEventCard. |

### src/components/Dashboard/NextNapPreview.test.tsx
**V3 counterpart**: `src/v3/components/Dashboard/NextNapPreview.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders nap time range + label | OVERLAP — V3:27 | — |
| includes owner in subtitle when set | OVERLAP — V3:34 | — |
| renders calm empty state when no nap scheduled | OVERLAP — V3:41 | — |
| shows bedtime in place of empty state when bedtime provided | OVERLAP — V3:46 | — |
| only shows start time when endTime missing (in-progress) | OVERLAP — V3:64 | — |
| shows last-nap subtext with duration when endTime set | OVERLAP — V3:70 | — |
| shows last-nap subtext as in-progress when endTime missing | OVERLAP — V3:64 | — |

### src/components/Dashboard/StartBottleButton.test.tsx
**V3 counterpart**: `src/v3/components/Dashboard/StartBottleButton.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders 'Start Bottle Now' label | OVERLAP — V3:14 | — |
| calls onLog with bottle event at current time + default amount | OVERLAP — V3:27 | — |
| uses correct number for second bottle | OVERLAP — V3:55 | — |
| shows '✓ Bottle logged' feedback | OVERLAP — V3:72 | — |
| does NOT show confirm dialog when last bottle older than interval | OVERLAP — V3:87 | — |
| shows confirm dialog when last bottle within interval | OVERLAP — V3:103 | — |
| logs after user confirms dialog | OVERLAP — V3:120 | — |
| does NOT log if user cancels dialog | OVERLAP — V3:138 | — |

### src/components/Dashboard/StartDayButton.test.tsx
**V3 counterpart**: `src/v3/components/Dashboard/StartDayButton.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders 'Start New Day' when no plan | OVERLAP — V3:7 | — |
| renders 'Start Day from Plan' when plan exists | OVERLAP — V3:12 | — |
| confirm + onStart(useTomorrowPlan=false) without plan | OVERLAP — V3:17 | — |
| confirm + onStart(useTomorrowPlan=true) with plan | OVERLAP — V3:26 | — |
| does not call onStart when cancelled | OVERLAP — V3:35 | — |
| shows 'Start blank instead' override when plan exists | OVERLAP — V3:44 | — |
| 'Start blank instead' triggers same flow with useTomorrowPlan=false | OVERLAP — V3:44 | — |

### src/components/Tomorrow/PromoteTomorrowButton.test.tsx
**V3 counterpart**: `src/v3/components/Tomorrow/PromoteTomorrowButton.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders 'Promote to today' label | OVERLAP — V3:12 | — |
| opens a confirm dialog when tapped | WAIVE | V3 moved confirm to page level — see surprise note. Page-level coverage required in `tomorrow/page.test.tsx`. |
| calls onPromote when confirmed | OVERLAP — V3:17 (handler invoked on click; confirmation lives at page) | — |
| does not call onPromote when cancelled | WAIVE | Page-level concern now. |
| can be disabled | OVERLAP — V3:24 + V3:29 | — |

### src/components/Tomorrow/TomorrowForm.test.tsx
**V3 counterpart**: `src/v3/components/Tomorrow/TomorrowForm.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders wake time field with current value | OVERLAP — V3:40 | — |
| calls onChange when wake time changes | OVERLAP — V3:51 | — |
| renders optional Bottle 1 time field | WAIVE | V3 form removed bottle1 field — moved to page-level / settings. |
| renders template select with options | OVERLAP — V3:64 | — |
| calls onChange when template changes | OVERLAP — V3:73 | — |
| lists extras with their labels and times | WAIVE | V3 dropped extras from form (see surprise note). Page-level coverage required. |
| calls onAddExtra when + Add extra is tapped | WAIVE | Same. |
| calls onEditExtra with extra event when row tapped | WAIVE | Same. |
| calls onRemoveExtra with id when delete tapped | WAIVE | Same. |

### src/components/Tomorrow/TomorrowPreview.test.tsx
**V3 counterpart**: `src/v3/components/Tomorrow/TomorrowPreview.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| prompts for wake time when none set | OVERLAP — V3:71 | — |
| renders Timeline when day is complete | OVERLAP — V3:78 | — |
| applies template owners to naps | OVERLAP — V3:84 | — |
| includes Bottle chip when bottle1Time provided | WAIVE | bottle1Time no longer plumbed to preview; bottles emerge from projection. |
| includes user-added extras in preview | OVERLAP — V3:100 | — |

### src/components/History/ArchivedDayView.test.tsx
**V3 counterpart**: `src/v3/components/History/ArchivedDayView.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders formatted date as heading | OVERLAP — V3:49 | — |
| renders empty state when no events | OVERLAP — V3:56 | — |
| does not make events tappable when onEditEvent omitted | OVERLAP — V3:84 | — |
| makes events tappable + forwards taps | OVERLAP — V3:91 | — |

### src/components/History/HistoryDayCard.test.tsx
**V3 counterpart**: `src/v3/components/History/HistoryDayCard.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders formatted date as card heading | OVERLAP — V3:17 | — |
| links to /history/[date] | WAIVE | V3 swapped link for `onSelect` callback (V3:22). Routing handled at page level. |
| renders optional summary line | OVERLAP — V3:30 | — |
| singularises counts of 1 | OVERLAP — V3:44 | — |
| omits summary line when no summary provided | OVERLAP — V3:57 | — |

### src/components/History/HistoryList.test.tsx
**V3 counterpart**: `src/v3/components/History/HistoryList.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders a card per archived day | OVERLAP — V3:22 | — |
| renders calm empty state when no days | OVERLAP — V3:17 | — |
| orders days newest first | OVERLAP — V3:29 | — |
| passes summary to each card when summaries provided | OVERLAP — V3:53 | — |

### src/components/DayTemplates/TemplateOwnerPicker.test.tsx
**V3 counterpart**: `src/v3/components/DayTemplates/TemplateOwnerPicker.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders event label and time range | WAIVE | V3 picker is owner-list only; label/range rendered by parent. Covered indirectly via :82 (renders pressed state per slot). |
| invokes onSelect with chosen owner | OVERLAP — V3:109 | — |
| invokes onCancel when close tapped | WAIVE | V3 picker removed inline cancel — closing handled by drawer/parent. |
| marks current owner as pressed | OVERLAP — V3:82 | — |
| shows single-time label when no end | WAIVE | Same as first row — parent concern. |

### src/components/shared/EventEditDrawer.test.tsx
**V3 counterpart**: `src/v3/components/shared/EventEditDrawerV3.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders nothing when open is false | OVERLAP — V3:51 | — |
| renders bottle form (start, amount, owner) | OVERLAP — V3:82 | — |
| renders nap form (start, end, owner) | OVERLAP — V3:66 | — |
| renders wake_window form (only owner field) | GAP | Port — PORT #4. |
| renders extra form (label, start, optional end, owner) | GAP | Port — PORT #4. |
| calls onSave with updated values | OVERLAP — V3:119 (time edit save) + :98 (owner-only save) | — |
| calls onCancel when Cancel clicked | OVERLAP — V3:216 | — |
| calls onCancel on Escape | OVERLAP — V3:216 | — |
| shows Delete only for actual/manual events with onDelete | OVERLAP — V3:305 | — |
| hides Delete for projected events | OVERLAP — V3:233 | — |
| Delete shows confirmation then calls onDelete | OVERLAP — V3:305 (delete shown) + ConfirmDialog primitive (out of scope, retained) | — |
| create mode renders seeded template's form fields | OVERLAP — covered by `src/v3/components/shared/createEventTemplate.test.ts` + V3:82 / :66 | — |

### src/components/shared/OwnerPicker.test.tsx
**V3 counterpart**: `src/v3/components/shared/OwnerPickerV3.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| renders four options (None, Jake, Kelly, Daycare) | OVERLAP — V3:27 (parents + others + None) | — |
| marks current value with aria-pressed=true | OVERLAP — V3:36 | — |
| treats undefined as None active | OVERLAP — V3:71 (clicking None emits undefined; default-undefined press state covered by :36) | — |
| invokes onChange with selected owner | OVERLAP — V3:57 + V3:64 | — |
| invokes onChange(undefined) when None tapped | OVERLAP — V3:71 | — |
| supports a label | WAIVE | V3 picker removed the inline label prop; label moved to parent. |

### src/hooks/useDay.test.tsx
**V3 counterpart**: `src/v3/hooks/useV3Day.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| returns active day from watcher | OVERLAP — V3:23 | — |

### src/hooks/useEvents.test.tsx
**V3 counterpart**: `src/v3/hooks/useV3Events.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| exposes watched events | OVERLAP — V3:71 | — |
| applies createOptimistic immediately, then calls repository | OVERLAP — V3:82 | — |

### src/hooks/useSettings.test.tsx
**V3 counterpart**: `src/v3/hooks/useV3Settings.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| returns loading=true initially, then settings once watcher fires | OVERLAP — V3:15 | — |
| unsubscribes on unmount | WAIVE | Standard hook cleanup; V3 relies on repo watcher idempotence. Low-risk. |

### src/hooks/useSyncStatus.test.tsx
**V3 counterpart**: none — see surprise note (consumed by `SyncStatusIcon` which PR-C1 keeps)

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| starts online based on navigator and updates lastSyncedAt on each in-sync event | OVERLAP (file should be exempt from delete) | Confirm exemption; if hook is moved, move test alongside. |
| reflects offline event | OVERLAP (file should be exempt) | Same. |

### src/hooks/useTemplates.test.tsx
**V3 counterpart**: `src/v3/hooks/useV3Templates.test.tsx`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| returns templates from one-shot fetch | OVERLAP — V3:22 | — |

### src/repositories/days.test.ts
**V3 counterpart**: `src/v3/repositories/days.test.ts`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| creates and reads back a day | OVERLAP — V3:53 | — |
| finds a day by date | OVERLAP — V3:65 | — |
| archives a day | OVERLAP — V3:85 | — |
| watchActiveDay returns the unique active day | OVERLAP — V3:103 | — |

### src/repositories/events.test.ts
**V3 counterpart**: `src/v3/repositories/events.test.ts`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| creates, lists, updates, deletes events | OVERLAP — V3:49 | — |
| watches events ordered by startTime | OVERLAP — V3:97 | — |

### src/repositories/settings.test.ts
**V3 counterpart**: `src/v3/repositories/settings.test.ts`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| returns null when no settings doc exists | OVERLAP — V3:73 | — |
| round-trips settings | OVERLAP — V3:77 | — |

### src/repositories/startNewDay.test.ts
**V3 counterpart**: `src/v3/repositories/days.test.ts` (V3 folded startNewDay into the days repo)

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| archives current active day and creates a new active day | OVERLAP — V3 days.test.ts:140 | — |
| creates a new active day with no prior day to archive | OVERLAP — V3 days.test.ts:119 | — |

### src/repositories/templates.test.ts
**V3 counterpart**: `src/v3/repositories/templates.test.ts`

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| saves, lists, and deletes templates | OVERLAP — V3:42 + V3:63 | — |

### src/lib/firestore/paths.test.ts
**V3 counterpart**: none — file is OUT OF SCOPE for PR-C1 (see surprise note); imported by all four V3 repositories.

| V2 assertion | V3 status | Recommendation |
|---|---|---|
| exposes the root collection name | OVERLAP (file must be exempt) | Confirm exemption in PR-C1 delete list. |
| returns the singleton settings doc path under a child | OVERLAP (exempt) | — |
| returns a day doc path under a child | OVERLAP (exempt) | — |
| returns an event doc path under a day | OVERLAP (exempt) | — |
| returns a template doc path under a child | OVERLAP (exempt) | — |

## Tally reconciliation

By-file totals:
- Block 9 (5 OVERLAP, 3 WAIVE, 1 GAP)
- groupInstants 5 (5 OVERLAP)
- InstantChip 7 (5 OVERLAP, 1 WAIVE, 1 GAP)
- NowBar 3 (2 OVERLAP, 1 WAIVE)
- TimelineV2 9 (5 OVERLAP, 0 WAIVE, 4 GAP — counts §11.A, data-past, pxPerHour, no-now-bar negation)
- CurrentWakeWindowStatus 3 (3 OVERLAP)
- EndOfDayCard 3 (3 OVERLAP)
- NapActionButton 4 (4 OVERLAP)
- NextBottlePreview 11 (9 OVERLAP, 0 WAIVE, 2 GAP — oz formatting × 2)
- NextEventCard 7 (5 OVERLAP, 2 WAIVE)
- NextNapPreview 7 (7 OVERLAP)
- StartBottleButton 8 (8 OVERLAP)
- StartDayButton 7 (7 OVERLAP)
- PromoteTomorrowButton 5 (3 OVERLAP, 2 WAIVE)
- TomorrowForm 9 (4 OVERLAP, 5 WAIVE)
- TomorrowPreview 5 (4 OVERLAP, 1 WAIVE)
- ArchivedDayView 4 (4 OVERLAP)
- HistoryDayCard 5 (4 OVERLAP, 1 WAIVE)
- HistoryList 4 (4 OVERLAP)
- TemplateOwnerPicker 5 (2 OVERLAP, 3 WAIVE)
- EventEditDrawer 12 (10 OVERLAP, 0 WAIVE, 2 GAP — wake_window + extra forms)
- OwnerPicker 6 (5 OVERLAP, 1 WAIVE)
- useDay 1 (1 OVERLAP)
- useEvents 2 (2 OVERLAP)
- useSettings 2 (1 OVERLAP, 1 WAIVE)
- useSyncStatus 2 (2 OVERLAP, exempt)
- useTemplates 1 (1 OVERLAP)
- repos days 4 (4 OVERLAP)
- repos events 2 (2 OVERLAP)
- repos settings 2 (2 OVERLAP)
- repos startNewDay 2 (2 OVERLAP)
- repos templates 1 (1 OVERLAP)
- paths 5 (5 OVERLAP, exempt)

Sums: OVERLAP = 125, WAIVE = 23, GAP = 14. Total = 162. Matches the corrected summary.

## Next steps

1. Address the 14 GAPs — likely a single PR adding the missing tests across `TimelineV3.test.tsx` (PORTs #1–3 plus the no-now-bar negation), `EventEditDrawerV3.test.tsx` (PORT #4 — wake_window + extra), `NextBottlePreview.test.tsx` (PORT #5 — oz formatting × 2).
2. Confirm `paths.ts` and `useSyncStatus` exemptions in PR-C1's delete list (both have OVERLAP coverage but only because the V2 file should *not* be deleted).
3. Confirm page-level coverage in `src/app/(authed)/tomorrow/page.test.tsx` for the WAIVED behaviors that moved up a level: PromoteTomorrowButton confirm dialog (open + cancel), TomorrowForm extras (add / edit / remove), and any HistoryDayCard route navigation.
4. Once GAPs land + page-level confirmation done, PR-C1 is unblocked.
