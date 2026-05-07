# Timeline v2 — Implementation Plan

> Status: **DRAFT — awaiting Jake review before implementation begins.**
> Source: `docs/design_handoff_baby_schedule/` (V1 Inline-Gutter direction).
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

## 6. Token additions

Add to `src/styles/tokens.css`:

```css
/* === Timeline v2 — type fills/strokes === */
--color-timeline-wake-fill:    /* warm cream, distinct from --color-bg */
--color-timeline-wake-stroke:  /* warm tan */
--color-timeline-nap-fill:     /* sage tint (lighter than --color-accent-soft) */
--color-timeline-nap-stroke:   /* deeper sage */
--color-timeline-putdown-fill-a: /* primary stripe color */
--color-timeline-putdown-fill-b: /* alternate stripe color */
--color-timeline-putdown-stroke: /* tan */
--color-timeline-custom-stroke:  /* event-type accent for custom blocks */

/* Instant dot colors per type */
--color-instant-bottle:  /* dusty blue or close — sample data uses #7c9bbd */
--color-instant-pump:    /* warm purple/lavender — sample uses #a37ab8 */
--color-instant-bedtime: /* deep navy — sample uses #3a3a55 */
--color-instant-custom:  /* sage-ish — sample uses #7a9479 */

/* Now line */
--color-now: var(--color-danger); /* reuse existing --color-danger or alias */
```

Owner colors already exist (`--color-owner-jake/kelly/daycare`); reuse them for the 5px left stripe and the "owner-fill" mode (using `-tint` variants for fills).

The exact hex values will be tuned during implementation against the screen — they should harmonize with the existing palette, not replicate the wireframe's hand-drawn pastels.

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
- Two instants at the same `at` → one group of two (concurrent fan).
- Two instants at different `at` → two groups, sorted by time.
- Mixed block + instant → blocks ignored.

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

## 11. Open questions (defaults proposed)

These are smaller calls; defaults will be used unless Jake objects.

### A. The `wake` event (the morning wake-up)

Today, `wake` events are filtered when they coincide with WW1 start (the chip would duplicate the block). In v2 the gutter handles density well, so the rule could change.

**Proposed default**: keep filtering. Rendering a "Wake" instant chip at the same time as Wake Window 1's left edge is still redundant.

### B. Custom block left/right marker lines (1px)

The handoff says custom blocks have 1px horizontal lines extending past their left and right edges to make start/end times visually clear (because custom blocks don't span a "natural" boundary like wake/nap do).

**Proposed default**: implement as specified. Use `--color-timeline-custom-stroke` for the line color.

### C. Owner color in "owner = fill" mode

When color mode is `owner`, the block's fill becomes the owner's color (light tint), and the type stroke becomes the type color. Stripe disappears (or moves — the handoff is ambiguous).

**Proposed default**: stripe disappears. Owner is encoded by fill alone in this mode. Less visual noise.

### D. Long block labels

Wake Window 4 owner names + putdown nested blocks may push label/range past the right edge of the block lane (≈ width minus gutter). Today we ellipsize.

**Proposed default**: ellipsize the label, drop the range to a second row, keep owner inline as a colored dot + name (no fallback truncation).

### E. Mobile breakpoint

The 110px gutter is fine on phones (default mobile width 375px → 50 axis + ~215 block + 110 gutter = balanced). On a desktop monitor, 110px gutter looks tiny against a wide block lane.

**Proposed default**: ship the same gutter width everywhere. Reconsider if it looks bad on desktop after the first build.

### F. Dim-past on `/day-templates`, `/tomorrow`, `/history`

`dimPast` is meaningful only for "today." On the other three:
- **Day-templates**: no "now" — `dimPast` should be off / ignored.
- **Tomorrow**: nothing is past — also off / ignored.
- **History**: the entire day is past; `dimPast` would mean "everything dimmed," which is silly. Off there too.

**Proposed default**: each call site passes `dimPast` explicitly. Only `/timeline` consults the user setting; the others hard-code `dimPast: false`. Same for `nowMinutes` (omit on the other three).

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

Before code on the `feat/timeline-v2-redesign` branch goes beyond this document:

- [ ] Jake reviews §3 (mapping table) and confirms or amends.
- [ ] Jake reviews §11 (open questions) and signs off on each default, or specifies alternatives.
- [ ] Jake confirms the §10 phasing is OK as-is, or wants different commit boundaries.

When all three are checked, implementation phases (10.1 → 10.11) can begin.
