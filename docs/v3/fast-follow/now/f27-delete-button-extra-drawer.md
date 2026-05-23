# §F27 — Delete button on Extra event drawer

**Source**: Jake, 2026-05-14 click-test of PR #139.

**Status**: `pending`

**What**: an extra (custom) event in the drawer has no delete button, so the only way to remove a one-off mistake is to wipe the day. The drawer's `canDelete` gate is `mode === "edit" && onDelete && isRecorded(lifecycle)` — for extras this should be true after a save (lifecycle becomes `completed`), but the drawer's parent may not be wiring `onDelete` for the extras path.

Mechanics: audit `EventEditDrawerV3.tsx` + the dashboard / tomorrow / timeline page handlers — confirm `onDelete` is passed for extras, and that the drawer's red "Delete" button appears for both kind=instant and kind=block extras.

**Why fast-follow**: small UI/wiring fix, no engine impact. Quality-of-life — without it, extras are write-only.

---


