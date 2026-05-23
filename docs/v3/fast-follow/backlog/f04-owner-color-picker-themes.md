# §F4 — Owner color picker as themes, not raw hex

**Source**: cutover dogfooding, 2026-05-09 — `OwnersConfigEditor`
(PR #64) currently exposes a free-text hex input for each owner's
color. Jake wants a curated palette instead.

**Status**: `pending`

**What**: replace the hex `<input type="text">` in
`OwnersConfigEditor` with a swatch picker constrained to a set
theme. The theme lives in `tokens.css` as named CSS variables
(`--owner-sage`, `--owner-terracotta`, `--owner-dusty-blue`,
`--owner-coral`, …); the picker shows them as labeled swatches
and writes the variable name (or its resolved value) onto
`OwnersConfig.{parent1,parent2,other[].color`.

Multiple themes possible later (light / dark / high-contrast)
without changing any owner data — only the variable resolves
differently per theme.

**Why fast-follow, not pre-V3**: pure UI. Doesn't change the
engine, the wire format on `OwnersConfig.color`, or any selector
contract. Pairs naturally with §F2 (palette refresh).

**Estimated effort**: 0.5 day. Single PR after §F2 lands so the
swatch set is the refreshed palette, not the legacy one.

**Acceptance**:
- No free-text hex input in `OwnersConfigEditor`.
- Swatches are accessible buttons (Tab to focus, Enter / Space
  to select; `aria-pressed` on the active one).
- The selected swatch's color value (or token name) is what
  Firestore stores — no hex anywhere in the form code.
- Existing owners with arbitrary stored hex values render
  correctly (closest-swatch fallback or sentinel "Custom" tile).

**Pixel-level alignment punchlist (deferred from PR #108 audit)**:
- Jake's owner pill is ~5-blue warmer than V2 (cream-toned `--color-bg`
  bleeds through the 20% mix). Math in `docs/_archive/v3/V2_CSS_DRIFT_AUDIT.md`.
  Possible fixes: bump mix to 25%, use `--color-surface` instead of
  `--color-bg`, or revert to per-owner pre-mixed `--owner-color-tint`
  tokens (loses owner-agnostic affordance).
- `CurrentWakeWindowStatus.dot` is hardcoded `var(--color-accent)`; V2
  varied it per owner. Wire to `var(--owner-color, var(--color-accent))`
  if the per-owner indicator is desired.

---


