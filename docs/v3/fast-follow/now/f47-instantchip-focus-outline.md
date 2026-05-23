# §F47 — Square focus outline on InstantChip (block focus outline is rounded)

**Source**: Jake, 2026-05-21.

**Status**: `pending`

**What**: focus-visible outlines on Block (`src/v3/components/Timeline/Block.module.css`) appear with rounded corners, but the same-shape rule on InstantChip (`src/v3/components/Timeline/InstantChip.module.css`) looks square. Both use identical `outline: 2px solid var(--color-accent); outline-offset: 1px;` with `border-radius` set.

**Cause**: at chip size (~24px tall, 12px radius), the `outline-offset: 1px` gap visually flattens the corner. Browsers follow border-radius on outlines but the perceptual effect at small sizes makes it look square. Block (50–100px tall) doesn't suffer the same issue.

**Fix shape**: swap `outline` → `box-shadow: 0 0 0 2px var(--color-accent)` (respects radius perfectly, no offset gap). Apply consistently to Block too. Test against keyboard nav and screen-reader focus paths.

**Why fast-follow**: visual polish; no semantic change.

**Estimated effort**: ~½ hr (CSS + one cross-browser visual check + verify focus order intact).

---


