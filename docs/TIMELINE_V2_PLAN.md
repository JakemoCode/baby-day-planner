# Timeline v2 — Implementation Plan

> Status: **APPROVED — implementation gated only on §10 phase ordering.**
> Source: `docs/design_handoff_baby_schedule-v1_only/` (V1 Inline-Gutter direction; the only design Jake selected).
> Branch: `feat/timeline-v2-redesign`.

This document captures every decision driving the Timeline v2 implementation. Anything not specified here is open and should be added before the relevant code lands.

---

## 1. Goal

Replace `src/components/Timeline/TimelineList.tsx` with a new component that implements the V1 Inline-Gutter design:

- **Three lanes**: axis (left, hour labels) | block lane (center) | instant gutter (right).
- **Block events** (have duration) live in the block lane.
- **Instant events** (no duration) live in the right gutter, pinned to their exact y, with a leader line back to the block lane.
- **Concurrent instants fan horizontally** in the gutter — never stack vertically.
- A **"now" line + pill** spans block lane + gutter; the pill sits in the axis lane only so it can't occlude events.

Reuse current fonts and tokens; extend tokens with the type/owner palette additions described in §6.

---

## 2. Confirmed decisions (from Q&A 2026-05-07)

1. **Event-type mapping**: Strict mapping, AND add a `kind: 'block' | 'instant'` field to the `Event` type.
2. **Toggles** ship as real settings:
   - **Color encoding** — type fills (default) vs. owner fills.
   - **Hour height** — slider 70–220 px/hr, default 120 (= 2 px/min).
   - **Dim past events** — default ON.
3. **Component strategy**: Build new component, delete old (`TimelineList.tsx` + tests).
4. **Scope**: All four call sites in one PR — `/timeline`, `/day-templates`, `/tomorrow` preview, `/history/[date]`.

---

## 3. Type-by-type mapping

| Today's `event.type` | New `kind` | New `type` (visual) | Notes |
|---|---|---|---|
| `wake_window` | `block` | `wake` | Full-width block. |
| `nap` | `block` | `nap` | Full-width block. |
| `putdown` | `block` | `putdown` | Anchored LEFT, narrower (right inset = 30 + gutter). Diagonal stripe fill. z-index above wake. |
| `extra` *with* `endTime` | `block` | `custom` | Anchored RIGHT as sub-block (left inset ≈ 110px). Wake/parent block label stays visible LEFT. 1px horizontal start/end marker lines extending past edges. |
| `extra` *without* `endTime` | `instant` | `custom` | Generic chip in gutter. Distinct dot color so it's visibly different from bottle/pump. |
| `bottle` | `instant` | `bottle` | Chip in gutter. |
| `pump` | `instant` | `pump` | Chip in gutter. |
| `dream_feed` | `instant` | `pump` (visual) | Same chip styling as pump (dream feed is conceptually a pump). Underlying `dream_feed` type stays in the data layer for engine logic. |
| `bedtime` | `instant` | `bedtime` | **No longer a block.** Engine still substitutes the late nap with a bedtime event, but emits `kind: 'instant'`. Existing manual-bedtime override path also emits `instant`. |
| `wake` (the wake-up event) | `instant` | `bottle`-style? | TODO §11.A — currently filtered out when it coincides with WW1 start; clarify behavior in v2. |

---

## 4. Schema change

Add `kind: 'block' | 'instant'` to the `Event` type in `src/domain/types.ts`.

### Persistence
- **New writes** persist `kind`.
- **Reads of legacy docs** (no `kind` field) derive it in the Firestore converter:
  ```ts
  const BLOCK_TYPES = new Set(['wake_window', 'nap', 'putdown']);
  // 'extra' is conditional: block iff endTime defined.
  function deriveKind(type, endTime) {
    if (BLOCK_TYPES.has(type)) return 'block';
    if (type === 'extra' && endTime !== undefined) return 'block';
    return 'instant';
  }
  ```
- No migration script. Old docs read fine; new docs persist `kind`. Within a few weeks of normal use, all active docs will have it.

> **TODO — cleanup ticket**: Once Firestore confirms zero docs without a `kind` field (run a one-shot query in a few weeks), delete the `deriveKind` fallback in the converter. Added to backlog in `docs/BUILD_STATUS.md` after this PR merges.

### Engine
- All engine pipeline steps already infer block-ness from `endTime`. The `kind` field is set when the engine emits an event; existing logic continues to work because `kind` is derivable from `(type, endTime)`.

---

## 5. New component shape

### Files added
- `src/components/Timeline/TimelineV2.tsx` — main component.
- `src/components/Timeline/TimelineV2.module.css` — layout.
- `src/components/Timeline/TimelineV2.test.tsx` — RTL tests.
- `src/components/Timeline/Block.tsx` + `.module.css` — single block (wake / nap / putdown / custom).
- `src/components/Timeline/InstantChip.tsx` + `.module.css` — single chip.
- `src/components/Timeline/InstantCluster.tsx` + `.module.css` — group of chips at one time, fans horizontally.
- `src/components/Timeline/NowBar.tsx` + `.module.css` — line + axis-pinned pill. Updates each minute.
- `src/components/Timeline/groupInstants.ts` — pure helper, ported from handoff.

### Files deleted (after swap)
- `src/components/Timeline/TimelineList.tsx`
- `src/components/Timeline/TimelineList.module.css`
- `src/components/Timeline/TimelineList.test.tsx`
- `src/components/Timeline/DurationBlock.tsx` + `.module.css` + `.test.tsx`
- `src/components/Timeline/PointMarker.tsx` + `.module.css` + `.test.tsx`

### Call sites (4) — all updated in same PR
- `src/app/(authed)/timeline/page.tsx`
- `src/app/(authed)/day-templates/page.tsx`
- `src/components/Tomorrow/TomorrowPreview.tsx`
- `src/components/History/ArchivedDayView.tsx`

### Props (proposed)
```ts
type TimelineV2Props = {
  events: Event[];
  nowMinutes?: number;
  onEventTap?: (event: Event) => void;
  scrollToNowOnMount?: boolean;
  /** Settings-driven; default 120 (= 2 px/min). */
  pxPerHour?: number;
  /** Settings-driven; default true. */
  dimPast?: boolean;
  /** Settings-driven; default 'type'. */
  colorMode?: 'type' | 'owner';
};
```

---

## 6. Token mapping (no new tokens)

**Per Jake's directive: do not add new color tokens.** Map every visual role to an existing token in `src/styles/tokens.css`. The palette refresh in the next backlog item will tune all surfaces in one pass; introducing more variation here works against that.

### Block fills + strokes

| Role | Token |
|---|---|
| Wake fill | `--color-surface-raised` (warm cream tint) |
| Wake stroke | `--color-border-strong` |
| Nap fill | `--color-accent-soft` (sage tint) |
| Nap stroke | `--color-success` (deeper sage) |
| Putdown stripe A | `--color-surface-raised` |
| Putdown stripe B | `--color-accent-soft` |
| Putdown stroke | `--color-border-strong` |
| Custom block fill | transparent (outline only) |
| Custom block stroke + 1px markers | `--color-muted` |

### Instant dots (type-mode)

Constraint: 4 distinct hues for bottle / pump / bedtime / custom that don't collide with owner colors (so owner-mode reads as a separate signal). Existing tokens we can repurpose:

| Type | Token | Rationale |
|---|---|---|
| Bottle | `--color-warning` (terracotta) | Warm, food-coded |
| Pump | `--color-muted` (warm gray) | Utilitarian, neutral |
| Bedtime | `--color-fg` (warm near-black) | Sleep / dark |
| Custom (instant) | `--color-accent` (sage) | Neutral generic |
| Dream-feed | `--color-muted` (visual = pump) | Same dot as pump per §3 mapping |

### Owner colors (already exist)

| Owner | Stripe / dot | Tint (owner-fill mode) |
|---|---|---|
| Jake | `--color-owner-jake` | `--color-owner-jake-tint` |
| Kelly | `--color-owner-kelly` | `--color-owner-kelly-tint` |
| Daycare | `--color-owner-daycare` | `--color-owner-daycare-tint` |

### Now line

Use `--color-danger` (existing). The bedtime dot uses `--color-fg`, so visual collision with the now line is avoided.

---

If a visual gap shows up during implementation (e.g. wake fill blends into page bg), I'll flag it and propose a token-level fix in the palette PR — not patch it in this one.

---

## 7. Layout constants

```ts
const AXIS_W = 50;            // px, hour labels lane
const GUTTER_W = 110;          // px, instant gutter
const PX_PER_MIN = 2;          // 120 px/hr default; configurable 70–220
const BLOCK_PADDING = '3px 6px';
const PUTDOWN_RIGHT_INSET = GUTTER_W + 30;  // narrower so wake text shows
const CUSTOM_LEFT_INSET = AXIS_W + 4 + 110; // sub-block from right
const OWNER_STRIPE_W = 5;      // px left border for owners
const NOW_PILL_HEIGHT = 18;    // approx
const LEADER_LINE_W = 4;       // px from block lane right edge to chip
```

---

## 8. Settings additions

Add to `Settings` type in `src/domain/types.ts`:

```ts
timelineColorMode: 'type' | 'owner';   // default 'type'
timelinePxPerHour: number;             // default 120, range 70-220
timelineDimPast: boolean;              // default true
```

Corresponding `Settings` editor section: `TimelineDisplayEditor.tsx` — radio for color mode, slider for px/hr, checkbox for dim past.

Default values populated by first-run defaults (existing `applyDefaults` path).

---

## 9. Test plan

### Unit tests on `groupInstants` (5 cases)
- Empty events → empty.
- Single instant → one group of one.
- Two instants at the same `at` → one group of two (these are what fan horizontally).
- Two instants at different `at` → two groups, sorted by time.
- Input mixes blocks and instants → returned groups contain only instants; blocks are filtered out by the helper. (`groupInstants` consumes the full event list and is responsible for ignoring `kind === 'block'`.)

### Component tests on `TimelineV2`
- Renders one block per duration event, positioned by start/height.
- Renders one chip per instant, positioned by time.
- Concurrent instants render in the same cluster (same `top`).
- Putdown rendered above wake (z-index check via DOM order or computed style).
- Custom block anchored right; not occluding parent wake's label (assert the wake's label is visible).
- Now bar visible, pill in axis lane (left edge < AXIS_W).
- Past events have reduced opacity when `dimPast` is on.
- `onEventTap` fires when a block or chip is clicked.
- Empty events array → empty state copy.

### Engine tests (regression)
All 361 existing tests must stay green. The bedtime engine change (block → instant) needs:
- Update `applyBedtime` to emit `kind: 'instant'` (drop `endTime` is already the case).
- Update affected tests' assertions.

### Settings tests
- New `TimelineDisplayEditor` mirrors the pattern of existing editors.
- Defaults applied on first run.

---

## 10. Implementation phases

Each phase ends in a passing test suite. Single PR (#TBD), but commits are atomic.

| # | Commit | Scope |
|---|---|---|
| 1 | `feat(domain): add kind field to Event` | Type change, converter derives kind on read, engine writes kind. Update fixtures + engine tests. |
| 2 | `feat(domain): bedtime emits instant kind` | `applyBedtime` change + tests. |
| 3 | `feat(settings): timeline display settings` | `Settings` type, defaults, editor section, tests. |
| 4 | `feat(timeline): groupInstants helper` | Pure function + 5 unit tests. |
| 5 | `feat(timeline): Block component` | Wake / nap / putdown / custom rendering, tokens, tests. |
| 6 | `feat(timeline): InstantChip + InstantCluster` | Chip styling, horizontal-fan cluster, tests. |
| 7 | `feat(timeline): NowBar` | Line + axis-pinned pill. |
| 8 | `feat(timeline): TimelineV2 assembly` | Pulls 4–7 together; layout + scroll-to-now. |
| 9 | `feat(timeline): wire TimelineV2 into 4 call sites` | Replace usages in 4 pages. |
| 10 | `chore(timeline): delete TimelineList + DurationBlock + PointMarker` | After call sites swapped + green. |
| 11 | `feat(tokens): timeline v2 palette additions` | Final token tuning against the screen. |

---

## 11. Open questions — resolved

### A. The `wake` event (the morning wake-up) — ✅ Confirmed
Keep filtering wake events that coincide with WW1 start.

### B. Custom block left/right marker lines (1px) — ✅ Confirmed
Implement as specified. Color: `--color-muted` (per §6).

### C. Owner color in "owner = fill" mode — ✅ Confirmed
Stripe disappears in owner-fill mode. Owner is encoded by fill alone.

### D. Long block labels — ✅ Confirmed with experimentation budget
Ellipsize the label, drop the range to a second row, keep owner inline as a colored dot + name.

**Truncation experiment plan**: start by allowing the label to use the **full block-lane width** (axis edge → gutter edge). If that reads as too much horizontal travel on long names, fall back to truncating at the **gutter inner edge** — i.e. clamp the label's max width to align with the leader-line origin. Document the choice in code with a comment so future-me knows which one shipped.

### E. Mobile vs. desktop layout — ✅ Confirmed with cap
Mobile keeps the design as-is. **Desktop caps the timeline's max content width at 640px** and centers it on wider viewports. The axis (50px) + gutter (110px) ratios stay constant inside that 640px ceiling, so the design language is identical at every breakpoint — desktop just stops growing.

### F. Dim-past on the other three call sites — ✅ Confirmed
Each call site passes `dimPast` and `nowMinutes` explicitly. Only `/timeline` consults the user setting; `/day-templates`, `/tomorrow`, and `/history` hard-code `dimPast: false` and omit `nowMinutes`.

---

## 12. Anti-requirements — re-asserted

These come straight from the handoff and **must hold** through the entire build:

- An instant chip never sits on top of block text.
- Two concurrent instants never stack vertically.
- The "now" pill never covers an event label or time.
- A putdown's stripes never cover the parent wake window's name or time text.
- A custom block's start and end are visually clear (the 1px marker lines).

These will be encoded as RTL assertions where feasible (e.g. wake's label is `.toBeVisible()` even when a putdown overlaps it).

---

## 13. Out of scope (explicitly)

- Drag-to-reschedule (long-press → drag) — design lists as optional; not building.
- Owner colors beyond the existing three (Jake / Kelly / Daycare) — keep current set.
- Palette refresh of non-timeline surfaces — that's the next backlog item, separate PR.
- Settings accordion / collapsible sections — separate backlog item.
- PWA / Wave 9.

---

## 14. Approval gate

- [x] §3 mapping table — confirmed.
- [x] §11 open questions — all six resolved (defaults A/B/C/F as proposed; D and E with refinements above).
- [ ] §10 phasing — pending Jake's OK on commit boundaries.

Once §10 is green, implementation phases (10.1 → 10.11) begin.
