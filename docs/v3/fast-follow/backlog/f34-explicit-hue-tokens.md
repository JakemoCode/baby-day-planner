# §F34 — Expose explicit hue tokens beside semantic ones

**Source**: Jake, 2026-05-18 (during F2 palette explore).

**Status**: `pending`

**What**: today the wedding-mood hues live behind semantic names —
`--color-warning` is the terracotta/rust, `--color-owner-parent-1` is
the dusty blue. Per-event-type styling (potentially landing in §F2b)
benefits from named hue tokens like `--color-rust`, `--color-blue`,
`--color-sage`, `--color-purple` that components can reference directly
without overloading the semantic tokens.

Add hue tokens as the source of truth; redefine the existing semantic
tokens in terms of them so nothing changes visually:

```css
--color-rust:   #bc5b2e;
--color-blue:   #649ec3;
--color-sage:   #7d9a7a;
--color-purple: #9b7bb3;
--color-warning: var(--color-rust);    /* alias */
--color-accent:  var(--color-sage);    /* alias */
```

**Why fast-follow**: enables §F2b (timeline event-type fills) without
forcing per-event styles to import the awkward semantic names. Doesn't
need to ship before F2b — could be folded into the same PR.


