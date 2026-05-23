# §F49 — Sync button: real refresh + spinner→check animation

**Source**: Jake, 2026-05-22 dog-fooding feedback.

**Status**: `pending`

**What**: The cloud-sync button in the app shell is a visual-only no-op today (no `onRefresh` prop wired in `AppShell`). When Jake's wife Kelly accepted the invite, her dashboard showed 0 events even after both pushed sync. Two pieces:
1. Actually trigger a network refresh: `disableNetwork(db)` then `enableNetwork(db)` to force Firestore to re-establish its listen streams (or, lighter touch, call `getDocs()` against `users/{uid}` and the active day's events with `source: 'server'`).
2. Replace the static icon with an animation: idle → spinner while pending → check (1.5s) → idle.

**Why fast-follow**: ships co-parent dog-fooding; cosmetic spinner without real refresh is worse than no button.

**Estimated effort**: ~½–1 hr.

---


