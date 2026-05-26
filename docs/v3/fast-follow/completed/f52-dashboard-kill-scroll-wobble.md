# §F52 — Dashboard: kill scroll wobble


Shipped in **PR #231** (`chore/tomorrow-dev-promote-and-scroll-wobble`). `AppShell.shell` switched from `min-height: 100dvh` to `height: 100dvh + overflow: hidden`; `.main` becomes the scroll container with `overflow-y: auto + min-height: 0`. TimelineV3's scroll-to-now adapted via `findScrollParent()` to walk up to the nearest overflow ancestor (falls back to window for tests / out-of-shell mounts).
