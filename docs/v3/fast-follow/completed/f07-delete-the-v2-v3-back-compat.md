# §F7 — Delete the V2 ← V3 back-compat shim


Shipped in **PR-C1** (commit `bacebe4`, merged 2026-05-11). Removed
`v2Backcompat.ts`, all V2 hooks (`useDays`, `useEvents`, etc.), V2
components under `src/components/`, the entire `src/domain/`
directory, and `src/lib/firestore/converters.ts`. V3 is the single
runtime.
