# Durable identity is the uuid `id`; `eventKey` is a renumberable slot/role label

**Status:** accepted (2026-06-01, §F66 grill — zombie-bottle investigation).

## Context

The "zombie bottle" bug: editing past bottles (concurrently, across two
devices) spawned no-owner duplicate bottles at the original forecast times
that reset couldn't kill. Root cause traced to two conflated notions of
identity:

- **`id`** — the Firestore doc id (storage identity). Pumps and FAB-created
  bottles already use a stable uuid (`<type>_<uuid>` via `newEventId`).
- **`eventKey`** — a *slot/role* label (`bottle_N`, `nap_N`, `recurring_<id>`,
  `bedtime`, `bottle_dream`).

`eventKey` for bottles is `bottle_<slot>` where the slot **renumbers** as the
day's bottle set changes (`computeRenumber`: projected slots start at
`maxRecorded + 1`). It also **diverges across momentarily-unsynced clients**.

`useAutoPromotePersistence` persisted auto-promoted *projected* bottles under
`recordedIdFor(eventKey)` = `recorded_<eventKey>` — i.e. it derived the
**storage** id from the **renumbering** key. So the same physical feed got
persisted under shifting / client-divergent ids, orphaning prior docs. This
also violated DATA_MODEL R2.2 ("`projected` never enters Firestore") and
DOMAIN §2 ("a stable internal identity that does not change when the labels
re-sort").

## Decision

The two identities have **separate, non-overlapping roles**:

1. **`id` (uuid) is the sole durable identity** of every event. User-created,
   -recorded, and -adjusted events persist under a stable
   `<type>_<uuid>` id (already true for pumps and FAB bottles). The doc id is
   **never** derived from mutable state (slot, startTime, or `eventKey`).

2. **`eventKey` is a renumberable slot/role label for engine semantics only** —
   owner-by-index (R12.6), template-slot mapping, owner overrides,
   recorded↔projected slot matching, and sentinel/role detection
   (`bottle_dream`, `recurring_<id>`). It re-sorts freely and **must never key
   or derive a Firestore doc**.

3. **`recordedIdFor(eventKey)` / the `recorded_<eventKey>` doc-id convention is
   removed.** An auto-promoted-then-adjusted bottle persists exactly like an
   added extra: a stable uuid id.

4. **Projections are never persisted** (R2.2). Only user-recorded/adjusted
   facts become docs; un-touched past forecasts are engine-computed
   `recorded`-lifecycle reality with no doc (re-derived identically each render,
   on every device).

## Consequences

- Kills the zombie/orphan class at the root; multi-client-safe (editing the
  same doc agrees on its uuid; projections are no longer auto-persisted, so
  there is no concurrent write of forecast docs).
- Owner-by-index (R12.6) and template mapping are **untouched** — `eventKey`
  keeps its slot number.
- **Migration (Contaminated Data):** existing `recorded_bottle_<N>` docs must be
  one-time migrated to uuid ids (or cleaned up); the implementation PR carries a
  `## Contaminated data` section.
- Durable state currently keyed on a *projected* (still-renumbering) `eventKey`
  — owner-only-edit-on-projected and `Day.ownerOverrides` — must hang off the
  frozen identity instead; folded into the implementation.
- Considered and rejected: making `eventKey` itself a uuid (fully matching
  pumps). It would force re-architecting owner-by-index and recorded↔projected
  matching to derive "the Nth bottle" purely from chronological sort — large
  blast radius for marginal gain over simply not *storing* the slot key.
