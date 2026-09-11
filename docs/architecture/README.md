# Architecture diagram

`baby-day-planner.html` is a standalone, interactive architecture diagram.
Open it in a browser; it needs no server and no network. It carries theme
switching, pan/zoom, search, relationship tracing, three guided views, and
PNG/SVG export.

`baby-day-planner.architecture.json` is the source. The HTML is generated,
so edit the JSON and re-render rather than hand-editing the HTML.

Node positions, labels, and the cards are pinned to
`5d659b8a12ecea0a046e71017d429b786042f0ec`, and each node carries verified
source references to real files at that commit. Re-render after any change
that moves a layer.

Regenerate with the Archify skill:

```sh
node ~/.claude/skills/archify/bin/archify.mjs deliver architecture \
  docs/architecture/baby-day-planner.architecture.json \
  docs/architecture/baby-day-planner.html \
  --quality showcase --repo-root .
```

`visual-check` on the delivered HTML writes screenshots and a receipt next to
it. Those are throwaway evidence, not committed.
