# §F12 — Confirm Tomorrow plan + auto-promote on Start Day


Absorbed into §F39 and shipped across **PRs #187** (TomorrowPlan schema), **#210/#212** (auto-rollover hook), and **#230** (UI: autosave + confirm pill + draft dot + chip-tap owner picker). The /tomorrow page now persists a draft → confirm → auto-applies-at-midnight model via `useReconcileActiveDay`.
