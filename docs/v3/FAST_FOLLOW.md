# V3 Fast-Follow Backlog

> Tracker for work to ship soon after V3. Per-entry files live
> under `fast-follow/{now,grill,backlog}/`. This file is a
> hand-maintained index — add new entries by creating a file
> in the right folder, then append a line here.

## Folders

- **`now/`** — CRITICAL + IMMEDIATE. Ship in next 1-2 weeks.
- **`grill/`** — needs design conversation before code.
- **`backlog/`** — valid but lower priority; revisit later.

Items move between folders via `git mv` as priorities shift.

Shipped items move to [`FAST_FOLLOW_COMPLETED.md`](./FAST_FOLLOW_COMPLETED.md) (compressed).

## Status legend

- `pending` — not yet started
- `in-progress` — actively being worked on
- `done` — landed; entry moves to COMPLETED, file deleted

---

## now/

- [§F8](./fast-follow/now/f08-dashboard-ux-polish.md)
- [§F23](./fast-follow/now/f23-edit-drawer-title-event-number.md)
- [§F27](./fast-follow/now/f27-delete-button-extra-drawer.md)
- [§F28](./fast-follow/now/f28-multi-chip-collapse-instants.md)
- [§F29](./fast-follow/now/f29-color-audit-terracotta-sage.md)
- [§F42](./fast-follow/now/f42-input-field-font.md)
- [§F47](./fast-follow/now/f47-instantchip-focus-outline.md)
- [§F48](./fast-follow/now/f48-last-nap-future-time.md)
- [§F49](./fast-follow/now/f49-sync-button-refresh-animation.md)
- [§F53](./fast-follow/now/f53-recurring-duration-zindex.md)
- [§F55](./fast-follow/now/f55-overlapping-instants-ux.md)
- [§F56](./fast-follow/now/f56-recurring-drawer-title.md)

## grill/

- [§F14](./fast-follow/grill/f14-settings-defaults-audit.md)
- [§F35](./fast-follow/grill/f35-named-multi-templates.md)
- [§F41](./fast-follow/grill/f41-onboarding-tutorial.md)
- [§F54](./fast-follow/grill/f54-bottle-cascade-overnight.md)
- [§F57](./fast-follow/grill/f57-extra-pump-overlap-ellipses.md)
- [§F58](./fast-follow/grill/f58-dream-feed-default-time.md)
- [§F62](./fast-follow/grill/f62-cancascade-idempotency-hole.md)
- [§F64](./fast-follow/grill/f64-nap-bedtime-too-aggressive.md)

## backlog/

- [§F2c](./fast-follow/backlog/f2c-chip-phase-switch-bottomtab-regressions.md)
- [§F4](./fast-follow/backlog/f04-owner-color-picker-themes.md)
- [§F5](./fast-follow/backlog/f05-wake-windows-after-wakeup-label.md)
- [§F6](./fast-follow/backlog/f06-time-duration-input-ux.md)
- [§F11](./fast-follow/backlog/f11-settings-explicit-save.md)
- [§F19](./fast-follow/backlog/f19-bottle-owner-picker-other.md)
- [§F30](./fast-follow/backlog/f30-instant-chip-vertical-align.md)
- [§F31](./fast-follow/backlog/f31-responsive-timeline-widths.md)
- [§F33](./fast-follow/backlog/f33-user-color-themes.md)
- [§F34](./fast-follow/backlog/f34-explicit-hue-tokens.md)
- [§F37](./fast-follow/backlog/f37-smarter-chip-truncation.md)
- [§F38](./fast-follow/backlog/f38-template-extras-fab.md)
- [§F40](./fast-follow/backlog/f40-display-settings-density-presets.md)
- [§F43](./fast-follow/backlog/f43-daycare-window-indicator.md)
- [§F44](./fast-follow/backlog/f44-auto-assign-daycare-owner.md)
- [§F45](./fast-follow/backlog/f45-history-detail-header-totals.md)
- [§F50](./fast-follow/backlog/f50-display-settings-font-size.md)
- [§F51](./fast-follow/backlog/f51-overnight-bedtime-stitch.md)
- [§F59](./fast-follow/backlog/f59-write-path-id-conventions.md)

---

## §F64 — Nap→bedtime substitution fires too aggressively when projected end crosses threshold

**Source**: Jake, 2026-05-24 (sibling to §F63).

**Status**: `pending` — needs design grill before coding.

**What**: At `src/v3/engine/rules/naps.ts:121` the projected-nap → bedtime substitution rule fires if EITHER (a) `napStart >= threshold` OR (b) `napStart + napLen > threshold`. When (b) fires alone (nap starts well before threshold but its default-length end barely crosses), bedtime's `startTime` is set to `napStart` — converting a 4:46pm projected nap into "bedtime starting 4:46pm" with threshold at 7:00pm. ~5h early.

Jake's repro (2026-05-24): extended nap 3 such that projected nap 4 starts at 4:46pm with napLen big enough that 4:46pm + napLen > 7:00pm threshold → nap 4 converted to bedtime at 4:46pm. Visually wrong.

**DOMAIN.md §3 reference**: *"A nap that lands at or after the bedtime threshold IS bedtime."* The literal reading is case (a) — nap STARTING at/after threshold. Case (b) is an engineer extrapolation that's now misfiring.

**Design candidates** (grill to pick):
1. Tighten to case (a) only: `wouldCrossThreshold = napStart >= threshold`. A nap whose default end barely crosses stays a nap; subsequent wake_window gets clipped. May leak: nap that starts 10min before threshold and runs into evening, weird tiny wake_window between nap end and bedtime.
2. Keep case (b) trigger but set bedtime `startTime = max(napStart, threshold)`. Preserves "big nap = bedtime" intuition, kills the early-bedtime visual. Subtle engine change; affects projected bedtime startTime semantics elsewhere.
3. Bedtime fires only when `napStart` is "close enough" to threshold (e.g., `napStart >= threshold - napLen/2`, or `napStart >= threshold - some buffer`). Heuristic; needs threshold tuning.

**Pairing**: grill alongside §F58 (Dream Feed) and §F54 outcome (just shipped). Bottle/nap cascade rules are the canonical "step-back trigger zone" per `feedback_step_back_when_complex`.

**Why fast-follow**: visually wrong but not data-corrupting; the converted bedtime is still editable from the drawer. Real but rare-ish.

**Estimated effort**: grill (~30 min) → ~1-2 hr engine + tests once the rule shape is locked.

---

## How items land here

Two paths:
1. **From OUT_OF_SCOPE**: an item flagged `fast-follow` during V3 review.
2. **During V3 build**: a polish item discovered while building V3
   that's clearly not engine-shaped — flag here rather than
   side-tracking the engine PR.

When adding: pick the right folder (now/grill/backlog), write
`fast-follow/<folder>/F<N>-short-slug.md`, then append a line to
this index. Per-file structure avoids merge conflicts when
multiple PRs add entries in parallel.

When done: move file to `FAST_FOLLOW_COMPLETED.md` (compressed)
and delete the per-entry file. Remove its line from this index.

---

## Source References

- `OUT_OF_SCOPE.md` — V3 scoping decisions (largely historical).
- `REQUIREMENTS.md` — V3 engine requirements.
- `ARCHITECTURE_V3.md` — V3 architecture context.
