# §F17 — Deprecate "Start Day" button; auto-anchor day at `defaultWakeTime`


Shipped across **PRs #210/#212**. `useReconcileActiveDay` auto-anchors the day via `getOrCreatePlannedDay`; the legacy "Start Day" button is now gated behind `process.env.NODE_ENV === "development"` as dev scaffolding only. Day creation no longer requires user interaction.
