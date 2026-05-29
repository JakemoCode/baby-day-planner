# §F28 — Multi-chip collapse for near-simultaneous instant events

**Source**: Jake, 2026-05-14 click-test of PR #139. Edge case caused by stacked custom events at 4:03p / 4:20p / 4:20p visibly overlapping in the chip column.

**Status**: `superseded-by-§F55` (Jake, 2026-05-29)

> Solved by **§F55** — `mergeNearbyGroups()` in `groupInstants.ts` + `CollapsedInstantCluster`. §F55 collapses overlapping instant chips into an "N events" cluster via a render-geometry collision test (chip height × `pxPerMin`) rather than this doc's fixed 5-min window. The visual breakage is gone; closing without separate work.

**What**: collapse instant chips that crowd the same vertical space on the timeline into a single "multi chip" so they don't overlap.

Rules:

| Scenario | Rendering |
|---|---|
| 1 event | Normal `InstantChip` (current behavior) |
| 2–3 events at the exact same start time | `InstantCluster` with shared timestamp (current behavior) |
| Any event(s) whose start times differ by `0 < diff < 5 min` from another event | **Multi chip**: `<first event's name> +<N> more`, NO timestamp |
| 4+ events at the same start time | **Multi chip**, same shape |
| An `InstantCluster` + any event within 5 min of it | **Multi chip** absorbing the cluster |

Multi chip tap target: opens a drawer listing each contained event with name + time, each row tappable to route into that event's normal edit drawer.

Mechanics: extend `src/v3/components/Timeline/groupInstants.ts` to bucket within a 5-min sliding window (not exact equality), and add a `MultiChip` component + drawer. `InstantCluster` stays for the 2–3-at-same-time path; threshold logic lives in groupInstants.

**Why fast-follow**: rare edge case (multiple custom events in a narrow window) but produces a visually broken stack when it happens. Not engine-shaped.

---


