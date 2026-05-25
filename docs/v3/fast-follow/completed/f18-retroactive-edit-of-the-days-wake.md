# §F18 — Retroactive edit of the day's wake time


Shipped in **PR #228** (`feat(dashboard): edit today's wake time after the fact`). `EditableWakeTime` component on /timeline lets the user back-edit a day's wake time via inline `<input type="time">`; writes to `Day.wakeTime` and rebuilds the cascade.
