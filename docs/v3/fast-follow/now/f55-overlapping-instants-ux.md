# §F55 — Overlapping instants UX (first label hidden, recurring drawer missing title, general polish)

**Source**: Jake, 2026-05-23.

**Status**: `pending`

**What**: When two or more instant events fall within ~X minutes of each other, the cluster renders such that:
1. The FIRST event's label is hidden / clipped.
2. If the first event is a recurring event, there's also no label in the drawer when tapped (see §F56, which is the same root cause manifesting in the drawer surface).
3. The general visual treatment of clustered instants "just looks bad" — needs an iteration pass for non-recurring too.

**Files likely involved**: `src/v3/components/Timeline/InstantCluster.tsx`, `groupInstants.ts`, `InstantChip.tsx`.

**Bundle**: ship with §F56 (drawer-title fix) since it's the same root cause for the recurring sub-case.

**Estimated effort**: ~1-2 hr (render iteration + drawer fix bundled).

---


