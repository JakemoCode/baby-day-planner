# V3 Engine

Declarative rules-engine rewrite of the baby-day planner's day-projection logic.

## Status

**Phase 1 — engine in isolation.** No UI changes; V2 still wired everywhere.

See `docs/v3/ARCHITECTURE_V3.md` for the full plan and `docs/v3/REQUIREMENTS.md` for the rules this engine implements.

## Layout

```
src/v3/
├─ README.md             ← you are here
├─ index.ts              ← public exports (projectDay, types)
├─ schemas.ts            ← V3 types (Event, Lifecycle, OwnerRef, Settings, …)
├─ lifecycle.ts          ← lifecycle state-machine reducer
├─ engine/
│  ├─ evaluator.ts       ← ~200-line term-rewriter; reality-wins guard
│  ├─ projectDay.ts      ← public API mirror of V2's projectDay
│  └─ rules/
│     ├─ index.ts        ← ALL_RULES export
│     ├─ naps.ts         ← R3.x + R7.x (sleep cascade — naps + bedtime)
│     ├─ wakeWindows.ts  ← R4.x  (TBD)
│     ├─ bottles.ts      ← R5.x  (TBD)
│     ├─ putdown.ts      ← R6.x  (TBD)
│     ├─ dreamFeed.ts    ← R8.x  (TBD)
│     ├─ pumps.ts        ← R9.x  (TBD)
│     ├─ extras.ts       ← R10.x (TBD)
│     ├─ dailyRecurring.ts ← R11.x (TBD)
│     ├─ owners.ts       ← R12.x (TBD)
│     └─ daycare.ts      ← R21.x (TBD)
└─ __tests__/
   └─ arbitraries.ts     ← fast-check generators
```

## Engine philosophy (REQUIREMENTS §0)

The engine **predicts**, it does not **prescribe**. Recorded events (lifecycle.state ∈ {started, completed}) are immutable to rules — the evaluator throws if any rule attempts to mutate or remove one.

Validations exist only at:
1. **Data integrity** — physically impossible values (negative durations, malformed times) reject saves.
2. **Interface hygiene** — confirm dialogs for likely-accidental input. Never engine-side.

## Migration plan

See `docs/v3/ARCHITECTURE_V3.md` §5. Strangler pattern; V2 keeps running daily through the V3 build. V3 ships behind a feature flag, then progressively replaces V2 surface by surface.
