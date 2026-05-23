# §F29 — Color audit: terracotta-on-sage contrast

**Source**: Jake, 2026-05-14 click-test of PR #141.

**Status**: `pending`

**What**: Kelly's owner color (`--color-owner-parent-2: #ce8e7e`, terracotta/coral) renders as text on top of sage-tinted nap and bedtime blocks (`--color-accent-soft: #b5c8b3`). Resulting contrast is low and the owner name is hard to read.

Mechanics: in the timeline's `[data-color-mode="type"]` mode, the block background comes from `--color-accent-soft` (sage) for nap/bedtime, and the owner text inside the block picks up `--owner-color` directly (raw saturated hue). The combo doesn't meet WCAG AA for small text.

Likely fix: introduce a "text on tinted block" variant of each owner color — darker, higher-contrast — or compute it with `color-mix` against a target lightness. Same logic the dashboard's `--color-owner-parent-2-tint` follows in reverse (light background tint exists; need a dark-text tint).

Worth a full color audit pass while we're at it: every owner-text-on-block pairing, plus pump-tint × owner text, plus daycare-gray × text.

**Why fast-follow**: a11y / legibility — not blocking but should land before any wider rollout.

---


