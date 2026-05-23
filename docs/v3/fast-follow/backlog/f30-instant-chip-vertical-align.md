# §F30 — Instant chip vertical alignment

**Source**: Jake, 2026-05-16 dogfooding.

**Status**: `pending`

**What**: instant chips (e.g. "Bottle 3 · 1p") sit vertically below their TimeMin tic line. Visible regression: a 1pm bottle's chip is offset BELOW the 1P axis tic, while adjacent block events (e.g. "Putdown · 1p") align correctly with the 1P line.

Likely cause: `InstantChip` (or its positioning wrapper in `TimelineV3.tsx`) uses the chip's TOP edge for the y-coordinate instead of vertical-center relative to the time axis. Block events use top-edge by design (a 60-min block starts at its startTime, runs downward); chips should use center-vertical because a chip has no duration and its visual anchor is the timestamp.

**Why fast-follow**: cosmetic — engine output is correct, render layer mis-positions one element type. One-file fix in the chip positioning calc.

---


