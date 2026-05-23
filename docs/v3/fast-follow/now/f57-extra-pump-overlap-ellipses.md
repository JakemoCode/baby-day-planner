# §F57 — Extra event with duration overlapping pump block renders as ellipses

**Source**: Jake, 2026-05-23.

**Status**: `pending`

**What**: When an extra event with a duration overlaps a pump block in time, the layout correctly fans them horizontally — but the extra event's label text is replaced with ellipses ("…") instead of the title. Pump renders fine.

**Cause hypothesis**: when the extra block's width is halved by the fan layout, the title CSS `text-overflow: ellipsis` triggers because the rendered width is below the threshold for the full label. Likely a width / min-width / padding issue in `Block.module.css` for the extra+pump fanned state.

**Fix shape**: audit Block.module.css for the fanned-extra layout; either bump the line-height / wrapping to two lines, or shorten the chrome padding when the block is narrow, or use a smaller label font in the fanned state.

**Estimated effort**: ~30 min (CSS iteration + visual verification).

---


