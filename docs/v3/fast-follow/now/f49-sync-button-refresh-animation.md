# §F49 — Sync button: real refresh + spinner→check animation

**Source**: Jake, 2026-05-22 dog-fooding feedback.

**Status**: `pending` — **low-prio, scope reduced** (Jake, 2026-05-29)

**Reduced scope (current intent)**: don't build a refresh action or a
spinner→check animation. Just make the sync indicator **turn red when
not up to date** (stale / offline / disconnected) and neutral when
current — a passive status color, not an interactive control. The
`onRefresh` prop already exists on `SyncStatusIcon` but is intentionally
left unwired; `AppShell` renders `<SyncStatusIcon />` with no handler.
The red/neutral state can drive off the existing `useSyncStatus()`
`online` / `lastSyncedAt` signals already in the component.

---

<details>
<summary>Original (larger) scope — deferred</summary>

**What**: The cloud-sync button in the app shell is a visual-only no-op today (no `onRefresh` prop wired in `AppShell`). When Jake's wife Kelly accepted the invite, her dashboard showed 0 events even after both pushed sync. Two pieces:
1. Actually trigger a network refresh: `disableNetwork(db)` then `enableNetwork(db)` to force Firestore to re-establish its listen streams (or, lighter touch, call `getDocs()` against `users/{uid}` and the active day's events with `source: 'server'`).
2. Replace the static icon with an animation: idle → spinner while pending → check (1.5s) → idle.

</details>

**Why fast-follow**: ships co-parent dog-fooding; a clear "you're stale" signal is the cheap 80% of the value.

**Estimated effort**: ~20–30 min for the red-when-stale state.

---


