# §F71 — "Reset" instead of "Delete" for engine-derived naps/bottles

Recorded rhythm slots don't get deleted — they revert to the cascade projection.
The drawer now labels them **Reset** (confirm: "Reset to projected time?"),
routing through the same onDelete path (delete the `recorded_<eventKey>` doc →
engine re-projects the slot). A recorded nap or cascade bottle → Reset;
user-added one-off bottles (uuid id), bedtime, extra, and pump → Delete.

Implemented via `drawerDestructiveAction` (delete / reset / none) in
`drawerDeletePolicy.ts`.
