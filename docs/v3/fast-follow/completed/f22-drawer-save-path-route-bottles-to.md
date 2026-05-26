# §F22 — Drawer save-path: route bottles to the correct calendar day


Shipped in **PR #143** (commit `d15731f`). Drawer save-path now routes
writes to the correct calendar day based on the event's `startTime`,
not the active `dayId` — so a 2 AM bottle attaches to the right day.
