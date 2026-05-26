# §F65 — Delete recurring event from today's timeline


Shipped in **PR #245** (`feat/f65-delete-recurring-from-today`). New
repo fn `suppressRecurringForDay` (arrayUnion into
`Day.suppressedRecurringIds`); `useDrawer` routes `daily_recurring`
delete through it; `EventEditDrawerV3` shows a Delete button on
projected recurring events with "Skip <event> today? It'll come back
tomorrow." confirmation copy. Engine's R11.6 already honored
suppression — this just adds the UI affordance.
