# §F23 — Edit drawer title should include event number when present

**Source**: Jake, 2026-05-13 click-test.

**Status**: `pending`

**What**: today the drawer title is "Edit bottle" / "Edit nap" / etc. Should include the event's number when applicable: "Edit Bottle 3", "Edit Nap 2". The number comes from the existing `Bottle N` / `Nap N` label that R5.4 chronological renumbering produces.

Mechanics: in `EventEditDrawerV3.tsx`, the `EDIT_TITLE_BY_TYPE` constant is a flat map of `type → string`. Replace with logic that derives the title from `event.label` (which already has the number for bottles/naps) or builds it from `type + extracted number from eventKey`.

**Why fast-follow**: tiny UI change, engine-orthogonal. Couple-line patch.

---


