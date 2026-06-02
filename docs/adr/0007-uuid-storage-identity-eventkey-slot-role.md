# Durable identity is the uuid `id`; `eventKey` is a renumberable slot/role label

**Status:** accepted (2026-06-01, §F66 grill — zombie-bottle investigation).
**Revised 2026-06-01** (continued grill, after an adversarial audit): the core
principle stands — *a durable doc id is never derived from a **renumbering**
value* — but the first draft over-generalized to "uuid everywhere / remove
`recordedIdFor` / projections never persisted." That was wrong on three counts
(it would break nap/bedtime reset, lose auto-promoted bottles from history, and
re-create the zombie via concurrent random uuids). The Decision below is the
corrected version.

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

**Principle:** a durable Firestore doc id is **never derived from a renumbering
value** (`eventKey`/`bottle_N`). `eventKey` and the doc `id` are separate roles.

1. **`eventKey` is a renumberable slot/role label for engine semantics only** —
   owner-by-index (R12.6), template-slot mapping, owner overrides,
   recorded↔projected slot matching, and sentinel/role detection
   (`bottle_dream`, `recurring_<id>`). It re-sorts freely and **must never key
   or derive a Firestore doc**.

2. **The durable doc `id` depends on how the event is created:**
   - **Deliberate single user action** (FAB-add, pump) → a random `<type>_<uuid>`
     (`newEventId`). One tap = one id; no concurrency risk.
   - **Auto-promoted bottle** (a forecast that crossed Now) → a **deterministic
     `recorded_bottle_t<startTime>`** id, mirroring the projected
     `proj_bottle_t<startTime>` id. uuid is **wrong** here: auto-promotion runs
     on every device, so two clients would mint two random uuids for the same
     feed → the zombie. A startTime-anchored id is client-deterministic, so
     concurrent writes converge to **one** doc.
   - **Naps / bedtime** → keep `recorded_<eventKey>` (`recorded_nap_2`,
     `recorded_bedtime`). Their `eventKey`s are slot-anchored and **do not
     renumber** (R5.4 is bottle-only), so the principle isn't violated.
     `recordedIdFor` is **retained** for these — only the *bottle* persistence
     path changes.

3. **Promotion ≠ persistence.** A projected event is never persisted *as
   projected* (R2.2). But the engine **promotes** a forecast that crosses Now to
   `recorded` (ADR-0006), and that promoted bottle **is persisted** — under the
   deterministic id above — so it survives in the historical record (archived
   days read static docs, no recompute) and the "zero-edit, the forecast was
   right" case sticks. We persist *recorded*-lifecycle bottles, not *projected*
   ones.

4. **Owner durable state keys off the stable identity, not `eventKey`.**
   `Day.ownerOverrides` (R12.10) and the owner-only-edit path move off the
   renumbering `eventKey`; owner-by-index (R12.6) maps by **chronological
   position** (matching the spec + DOMAIN §2), not the eventKey slot.

5. **No skip/suppression for cascade feeds.** A baby never skips a feed (it
   moves, shrinks, or an extra appears — Jake, §F66 grill), so there is no
   "didn't happen" deletion. Cascade bottles are *edited*, never suppressed.
   (Dream-feed/recurring keep their own suppressions — optional scheduled events.)

## Consequences

- Kills the zombie/orphan class at the root. **Multi-client-safe by
  construction:** two devices auto-promoting the same feed compute the *same*
  `recorded_bottle_t<startTime>` doc id, so they write the **same doc** (it
  converges) instead of two divergently-keyed orphans.
- **History preserved:** auto-promoted bottles remain durable docs, so archived
  days (which read static docs, no recompute) still show them.
- **Owner-by-index (R12.6) changes** from eventKey-slot to **chronological
  position** — aligning the code with its own spec ("bottle 1 = earliest by
  clock"). Owner durable state (R12.10 / owner-only-edit) re-keys off `eventKey`.
- **Migration (Contaminated Data):** existing `recorded_bottle_<N>` bottle docs
  are one-time migrated to **deterministic `recorded_bottle_t<startTime>`** ids
  (so two clients converge); the implementation PR carries a `## Contaminated
  data` section and runs against a captured real-data export. Nap/bedtime docs
  are **not** migrated (they keep `recorded_<eventKey>`).
- Considered and rejected: making `eventKey` itself a uuid (fully matching
  pumps). It would force re-architecting owner-by-index and recorded↔projected
  matching to derive "the Nth bottle" purely from chronological sort — large
  blast radius for marginal gain over simply not *storing* the slot key.
