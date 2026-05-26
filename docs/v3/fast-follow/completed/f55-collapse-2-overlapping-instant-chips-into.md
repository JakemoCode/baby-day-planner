# §F55 — Collapse 2+ overlapping instant chips into a "N events" chip + sheet


Shipped in **PR #244** (`fix/f55-f56-f57-render-polish`). Two or more
instant events whose vertical chip ranges would overlap collapse into a
single "N events · 5:30–5:35p" chip. Tap opens a `BottomSheet` (new
`GroupedEventsSheet`) listing each event; row tap routes to the existing
`EventEditDrawerV3`. Detection in `mergeNearbyGroups(groups, collisionMin)`
runs after `groupInstants`; threshold scales with `pxPerMin`. Chip stacks
label / time-range / "Tap to view" on three lines.
