# §F19 — Bottle owner picker: support "other" owners (named extras)

**Source**: Jake, 2026-05-12 click-test.

**Status**: `pending`

**What**: bottle owner picker should let the user select an `other:<id>` owner (Grandma, Daycare, Babysitter, etc.) — not just `parent1` / `parent2`. The schema (`OwnersConfig.other: Array<{id, displayName, color}>`) already supports this; the picker just needs to render the configured `other[]` entries alongside the parents, with affordance to add a new named owner inline.

**Why fast-follow**: engine + schema already there; pure UI gap. Affects bottle assignment realism for families using daycare or alloparents.

---


