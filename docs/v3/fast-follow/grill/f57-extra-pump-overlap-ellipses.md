# §F57 — Extra event with duration overlapping pump renders as ellipses

**Source**: Jake, 2026-05-23. Sharpened diagnosis 2026-05-23 (during §F55/§F56 bundle work).

**Status**: `pending` — needs design grill. Initial diagnosis ("text-overflow ellipsis from fanned column") was incorrect.

**Actual geometry**:
- `TimelineV3.tsx:89-91`: BOTH `extra` and `pump` blocks get the same column from `blockGeometry()`: `left: BLOCK_LEFT_INSET + CUSTOM_LEFT_EXTRA (146), right: BLOCK_RIGHT_INSET (148)` — a ~96 px column on a 390 px viewport.
- `Block.tsx:67-70`: pump overrides its position to `right: rightPx, width: "max-content"`, growing leftward to fit "Pump · 5:30-5:45p".
- `Block.module.css:67`: pump has `z-index: 5`, extra has `z-index: 4`.

So pump paints over the right portion of extra. The extra's label sits in the 96 px column; the visible portion is only the leftmost ~26-36 px before pump's left edge covers the rest. `text-overflow: ellipsis` triggers at the extra's own right edge (148, hidden behind pump). Visually: pump on the right, "Pe…" on the left.

**Why a CSS-only patch is insufficient**: the extra's clip is at its underlying right edge (148), where pump happens to sit. Widening the extra, wrapping its label to 2 lines, or shrinking padding all leave the right portion under pump.

**Design candidates** (grill to pick):
1. **Data-driven left shift**: pass `pumpAtThisTime: boolean` from TimelineV3 → Block. When true, extra renders at `right: 88` (or pump's max-content width + gap), giving extra its own visible column. Pros: minimal code, no measurement needed. Cons: hardcoded width estimate; brittle if pump labels get long.
2. **Vertical stack**: when extra and pump overlap in time, render extra ABOVE the pump (offset topPx by `-pumpHeight`). Pros: full label space for extra. Cons: extra no longer aligns to its actual startTime; new alignment ambiguity.
3. **Separate columns architecturally**: extras get their own column (e.g. `left: BLOCK_LEFT_INSET + 60, right: 240`), distinct from pumps. Pros: clean separation; never collides. Cons: extras stop visually "punching into" the nap lane, which was a deliberate design choice.
4. **Horizontal fan with DOM measurement**: ResizeObserver on pump, dynamically narrow extra's right inset to clear pump. Pros: precisely correct visually. Cons: ResizeObserver complexity, layout-thrash risk, hard to test.

**Pairing**: design grill alongside §F55 outcome (shipped via this bundle).

**Why fast-follow**: the visual is broken but data is fine and the event is still tappable via the visible left edge.

**Estimated effort**: 30-min grill → 1-2 hr implementation depending on which candidate wins.
