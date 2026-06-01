# §F72 — Config-driven field schema for the event drawer

**Status**: scope (pre-implementation)
**Branch**: `refactor/f72-drawer-field-schema`
**Shape**: single behavior-preserving PR. All existing drawer tests stay green.

## Problem

`EventEditDrawerV3` decides field presence + layout with six per-type
booleans (`showStartTime / showEndTime / showAmount / showVolumes /
showOwner / showLabel`) plus a `timeFields` ternary that pairs pump
start/end onto one row. Adding an event type or field means touching
several scattered booleans and the render body. This layer is genuinely
declarative — it should be one table.

## In scope — the field/layout layer only

Collapse the show-flags into a per-`EventType` ordered field schema and
walk it with one renderer.

```ts
type DrawerField = "label" | "startTime" | "endTime" | "amount" | "volumes" | "owner";
type FieldRow = DrawerField | { row: DrawerField[] };
const DRAWER_FIELDS: Record<EventType, FieldRow[]> = { … };
```

The existing per-field JSX (start-time block with its now-button + error,
end-time block, amount, volumes section, owner picker, label) stays
exactly as built — it becomes a `Record<DrawerField, ReactNode>` the
renderer indexes by schema key. Field membership replaces each `show*`;
`{ row: [...] }` replaces the pump `timeFields` ternary.

Schema derived from current flags (preserves today's order + grouping):

| Type | Fields (in order) |
|---|---|
| `wake_window` | owner |
| `nap` | startTime, endTime, owner |
| `bottle` | startTime, amount, owner |
| `pump` | `{row:[startTime,endTime]}`, volumes |
| `bedtime` | startTime, owner |
| `extra` | label, startTime, endTime, owner |
| `daily_recurring` | startTime |
| `daycare_dropoff` | startTime, owner |
| `daycare_pickup` | startTime, owner |

(`volumes` already renders Left/Right as its own paired section; it stays
one field. `label` precedes the time fields today — preserved.)

## Explicitly OUT of scope — interaction logic stays as code

These depend on runtime state (now, sibling events, lifecycle, settings)
and cross-field logic. Forcing them into a per-type object just relocates
closures into "config" without simplifying. Untouched:

- now-button windows (`isFocusNap` / `isActiveNap` / `isNearestBottle` + grace)
- reset/delete policy (`drawerDestructiveAction`)
- nap→bedtime threshold prompt + short-nap confirm
- future-projected locking (`futureProjected` disables inputs)
- `applyStartTime` duration-preservation, save/validation routing

The field JSX keeps its own interaction wiring; the schema only decides
**which** fields render and **how** they're grouped.

## Verification

No behavior change, so the existing suites are the spec:
`EventEditDrawerV3.test.tsx`, `.a11y.test.tsx`, `drawerDeletePolicy.test.ts`,
`pumpVolume.seam.test.tsx`. Add a small `drawerFieldSchema.test.ts` asserting
each `EventType` maps to the expected field list (guards future edits).
