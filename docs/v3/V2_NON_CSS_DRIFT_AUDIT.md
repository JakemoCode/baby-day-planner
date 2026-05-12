# V2 → V3 Non-CSS Drift Audit (Second Pass)

> Generated 2026-05-11. The first audit (PR #108, `V2_CSS_DRIFT_AUDIT.md`)
> was CSS-only and missed three regression classes. This pass covers
> them: schema field deletions, default-value drift, and missing UI.

## Method

V2 baseline SHA: `df685c3` (parent of PR-C1's wipe commit `bacebe4`).

For each of the three classes:
1. Diff V2 vs V3 (schema types, defaults constants, Settings page editor inventory).
2. Categorize each finding as `regression / restored`, `intentional V3 change / kept`, or `regression / surfaced for review`.

## Findings

### Class 1 — Schema field deletions

| V2 field | V3 status | Verdict | Action |
|---|---|---|---|
| `Settings.timelineColorMode?: "type" \| "owner"` | dropped | **regression** | restored as `timelineColorMode: "type" \| "owner"` (required, defaults to "type") |
| `Settings.cookDinner?: { enabled, time }` | replaced by `dailyRecurring[]` | intentional | keep V3 reshape |
| `Settings.dreamFeed: DreamFeedSettings` (nested) | replaced by flat `dreamFeed*` fields | intentional | keep V3 flat shape |
| `Day.ownershipTemplateId` | renamed to `templateId` | intentional | keep V3 name |
| `Day.createdAt` / `Day.archivedAt` | dropped | intentional | keep deletion |
| `Event.source` / `status` / `recorded` | replaced by `lifecycle` union | intentional | keep V3 reshape |

**Restored: 1 (timelineColorMode)**

### Class 2 — Default value drift

| Field | V2 default | V3 default | Verdict | Action |
|---|---|---|---|---|
| `timelinePxPerHour` | 120 | 80 | **regression** | restored to 120 + one-time migration of legacy 80 → 120 (mirrors `migrateOwnerSlot` pattern) |
| `parent1.color` | `--color-owner-jake` pastel | `#0af` | already restored | (PR #107 — pastel `#7a8fa8`) |
| `parent2.color` | `--color-owner-kelly` pastel | `#f0a` | already restored | (PR #107 — pastel `#ce8e7e`) |
| `defaultWakeTime` | varies per source | `7 * 60` | match | keep |
| `bedtimeThreshold` | `19:00` | `19 * 60` | match | keep |
| `defaultNapLengthMinutes` | varies | `90` | flagged in §F14 as "should be 45" — defer | keep, §F14 owns this |
| Wake-window minutes | TBD | `[120, 150, 180, 180, 180, 180]` | flagged in §F14 | keep, §F14 owns this |

**Restored: 1 (pxPerHour)** plus the migration. Other numeric defaults flagged in §F14 for Jake's call.

### Class 3 — Missing UI

| V2 editor | V3 status | Verdict | Action |
|---|---|---|---|
| `TimelineDisplayEditor` | no V3 replacement | **regression** | restored inline (Settings page → "Timeline display" section with 3 controls: colorMode, pxPerHour, dimPast) |
| `OwnersConfigEditor` | exists in V3 | match | keep |
| `WakeWindowsEditor` | inlined as `WakeWindowsRow` | match | keep |
| `PumpTimesEditor` | inlined as `PumpTimesRow` | match | keep |
| `BottleRulesEditor` | inlined as NumberRows | match (partial — bottle rules array editor itself may be gone, but the defaults are exposed) |
| `NapDefaultsEditor` | inlined as NumberRows | match |
| `DreamFeedEditor` | **no V3 replacement** | regression | NOT restored in this PR. Schema fields (`dreamFeedEnabled`, `dreamFeedStart`, `dreamFeedEnd`, `dreamFeedOffsetAfterBedtimeMinutes`) exist but no UI. Logged for §F14. |
| `CookDinnerEditor` | replaced by `dailyRecurring` concept | needs investigation | `dailyRecurring[]` is the V3 shape; no V3 editor exists either. Logged for §F14. |
| `WeekendTemplateEditor` | replaced by Day Templates page | intentional | keep |
| `SettingsAccount` | moved to V3 (PR-C1) | match | keep |
| **Daycare config editor** | none in V2, none in V3 | both gone | `DaycareConfig` schema exists; no editor either side. Logged for §F14. |

**Restored: 1 (TimelineDisplay)**. **Flagged for §F14: 3 (DreamFeed, dailyRecurring/CookDinner, Daycare).**

## What this PR ships

1. Schema: `Settings.timelineColorMode: "type" | "owner"` added (required, defaults to "type").
2. Defaults: `timelinePxPerHour: 80 → 120`. Legacy-80 migration in `withV3SettingsDefaults`.
3. Settings page: new "Timeline display" section with three controls (`ColorModeRow`, `NumberRow` for pxPerHour, `CheckboxRow` for dimPast).
4. All five `TimelineV3` callsites updated to pass `colorMode={settings.timelineColorMode}`.
5. `ArchivedDayView` extended with an optional `colorMode` prop so the history detail page can respect the user's setting.
6. Fixture/factory test files updated to include `timelineColorMode: "type"` in their Settings literals.

## Bonus: chip vertical-centering fixes (per Jake's direct CSS diff)

Jake provided a precise CSS diff during this PR; applied as part of the bundle:

- `InstantChip.module.css` `.chip` — `align-items: flex-start → center`, `padding: 3px 8px → 6px 10px`
- `.dot` — removed the magic `margin-top: 3px` nudge
- `.topRow` — `align-items: baseline → center`

These were the actual root cause of the "wonky chip vertical centering" complaint that the first audit didn't surface (CSS modules were byte-identical to V2; the V2 version had different padding so the misaligned dot looked fine in V2 context).

## Not addressed (logged for §F14)

- `DreamFeedEditor` — V3 has no UI for `dreamFeed*` fields
- `dailyRecurring` editor — V3 schema has the array, no UI to manage entries
- Daycare config editor — schema exists, no UI either V2 or V3
- Numeric default audits Jake flagged in earlier feedback (`defaultNapLengthMinutes`, `bedtimeThreshold`, etc.) — §F14 owns these
- Duration display as HH:MM (§F6)
