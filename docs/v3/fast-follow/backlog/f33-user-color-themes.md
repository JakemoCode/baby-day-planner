# §F33 — User-selectable color themes

**Source**: Jake, 2026-05-18 (during F2 palette explore).

**Status**: `pending`

**What**: let the user pick from several themed palettes in Settings.
`tokens.css` already supports manual override via `[data-theme="dark"]`
on `<html>`; extend that mechanism to named light themes (e.g.
"Sage" (current), "Coastal" (blue-leaning), "Sunset" (rust-leaning),
plus the existing dark mode).

**Why fast-follow**: pure UI/UX; no engine impact. Worth waiting until
the F2 palette work settles so the "default" theme is stable before
adding alternatives.

**Estimated effort**: 2–3 days. ~3 hand-tuned palettes + a Settings
picker + localStorage persistence (mirror existing accordion
remembered-section pattern).

---


