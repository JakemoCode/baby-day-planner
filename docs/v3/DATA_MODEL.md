# DATA_MODEL.md — V3 Schema, Lifecycle & Persistence

> This doc is the authoritative spec for **how data is structured, what
> states events move through, and how everything is persisted**. For
> scheduling rules that operate on this data, see
> [ENGINE_SPEC.md](ENGINE_SPEC.md). For timeline display and UX behavior,
> see [RENDER_SPEC.md](RENDER_SPEC.md). Historical rules (pre-reorg) are
> preserved in
> [docs/_archive/v3/REQUIREMENTS_v3_legacy.md](../_archive/v3/REQUIREMENTS_v3_legacy.md).

---

## Table of Contents

- [§1 Event Data Model](#1-event-data-model)
- [§2 Event Lifecycle & Status](#2-event-lifecycle--status)
- [§14 Day Lifecycle](#14-day-lifecycle)
- [§19 Settings](#19-settings)
- [§20 Persistence (Firestore)](#20-persistence-firestore)
- [§22 Membership Management](#22-membership-management)

---

## §1 Event Data Model

### R1.1 Every event has a stable identity composed of `(id, eventKey)`

`id` is the Firestore document id. `eventKey` is the semantic slot identifier
(`nap_2`, `bottle_3`, `bedtime`, `wake_window_1`, `cook_dinner`).

**Slot events (nap, bedtime) use deterministic ids: `id === eventKey`.**
Nap N has `id === eventKey === "nap_N"`. Bedtime has `id === eventKey === "bedtime"`.
Events are scoped under a per-day Firestore path
(`children/{childId}/days/{dayId}/events/{id}`), so ids need not be
globally unique — day scoping provides the namespace.

All other event types (bottle, extra, pump, daily_recurring, daycare)
continue to use UUID-based ids via `newEventId`.

- **Why**: `eventKey` lets the engine match user docs against projected
  slots. Two docs with the same `eventKey` (e.g. Start Nap + End Nap)
  represent one logical event. With slot ids, `id === eventKey` — no
  translation layer between the two identity systems. `saveEvent` routes
  create-vs-update by id match; deterministic ids mean Start Nap Now
  always routes to update if the nap already exists.
- **Edge case it prevents**: dashboard counter double-counting Start/End
  pairs. Without `eventKey` dedupe, Nap 1 reads as 2 nap recordings.

### R1.2 Every event has a `kind` discriminator: `"block" | "instant"`

Blocks have duration (rendered in center lane). Instants are
point-in-time (rendered in right gutter as chips).

- **Why**: layout is data-driven; the renderer never re-derives kind from
  shape.
- **Edge case it prevents**: extra events with optional endTime would
  otherwise need special-casing in 4+ render sites.

### R1.3 `kind` is deterministically derived from `(type, endTime)` for legacy docs

```
wake_window | nap | putdown | bedtime  → block
extra with endTime defined              → block
extra without endTime, plus everything else → instant
```

- **Why**: legacy Firestore docs predate the explicit field. The
  Firestore converter coerces on read so the engine never sees a missing
  `kind`.
- **Edge case it prevents**: a single legacy doc without `kind` crashes
  the renderer's discriminator switch.

### R1.4 `recorded: boolean` is the canonical "user committed this" gate

- `false`: projection from the engine OR a stale annotation
  (owner-only edit). Engine recalculates around these freely.
- `true`: user explicitly recorded — Start/End Nap, Start Bottle Now,
  FAB-create, drawer time-edit. Counters / overlap validation /
  cascade anchoring all use this gate.

- **Why**: `source` (provenance) and `status` (lifecycle stage) couldn't
  individually distinguish "annotation" from "recording." `recorded` is
  the explicit yes/no.
- **Edge case it prevents**: owner-only annotations inflating dashboard
  ordinals (the "Start Nap 4 when Nap 1 hasn't happened" bug).

### R1.5 Times are minutes-since-midnight; cross-midnight uses 24+ hours

Internal representation is integer minutes. Display strings are `"HH:MM"`
24h, with `"30:00"` meaning 6 AM next day.

- **Why**: bedtime visually extends through the night; representing this
  natively is simpler than juggling Date objects with timezones.
- **Edge case it prevents**: bedtime block clipping at midnight when it
  should carry into the empty morning.

### R1.6 `formatTimeForDisplay()` mods 1440 for human-readable AM/PM

Internal `30:00` displays as `"6:00 AM"` when shown to users.

- **Why**: users read 12h time; engine math uses unbounded minutes.
- **Edge case it prevents**: showing "30:00" or "6:00 AM next day" in
  chip labels — visually broken.

### R1.7 Owners are configurable, not hard-coded — three slots

V3 generalizes V2's hard-coded `Jake | Kelly | Daycare`. The schema
defines three semantic slots:

```ts
type OwnerSlot = 'parent1' | 'parent2' | 'other';

type OwnerConfig = {
  parent1: { displayName: string; color: ColorToken };
  parent2: { displayName: string; color: ColorToken };
  // Multiple "other" entries supported (Daycare, in-laws, babysitter, etc.)
  other: Array<{ id: string; displayName: string; color: ColorToken }>;
};
```

Stored under `Settings.owners` (or a sibling doc). Defaults:
`parent1.displayName = "Parent 1"`, `parent2.displayName = "Parent 2"`,
`other = [{ id: 'caregiver1', displayName: "Caregiver" }]`.

**`displayName` is a free-form, user-editable string** — the user
types whatever they want in Settings ("Jake", "Mom", "Papa", "Kelly",
"Grandma Rose"). The engine never inspects the string; it's purely
for presentation. Only the slot identity (`parent1` / `parent2` /
`other:id`) participates in template lookups and inheritance rules.

First-run setup screen prompts the user to fill in real names.

An `Owner` reference on an Event is `{ slot: OwnerSlot; otherId?: string }`
(or just a string id under the hood). The display layer resolves to a
name + color via the config.

- **Why**: the app is currently built for Jake + Kelly; if anyone else
  wants to use it, the codebase shouldn't bake in our names. Slot-based
  with display config = portable.
- **Edge case it prevents**: every reference to "Jake" / "Kelly" /
  "Daycare" in code, copy, and color tokens having to be hand-changed
  for a fork. Slots stay constant; display strings come from config.

### R1.7.1 "Other" supports multiple named entries

Daycare, in-laws, babysitter, sister, friend — each is a distinct
"other" entry with its own id and displayName. Templates and event
docs reference the id; UI looks up the name.

- **Edge case it prevents**: collapsing all non-parent caregivers into
  a single "Other" with no way to distinguish "Daycare nap" from
  "In-laws nap."

### R1.7.2 Owner config is per-child / per-account

A single Settings doc owns the slot config; multi-child support
(out of scope for V3 — see OUT_OF_SCOPE §1) would expand this.

### R1.8 An event with `recorded: true` has a permanent commitment

Once `recorded: true`, future drawer saves keep it true. Owner-only
re-edits cannot un-record.

- **Why**: a recording is a fact about the day. Annotating it shouldn't
  retroactively change whether it happened.
- **Edge case it prevents**: a user editing owner on a recorded nap
  un-recording it and breaking the dashboard counter.

---

## §2 Event Lifecycle & Status

### R2.1 The three valid states are `projected | recorded | completed`

- `projected` — engine output, never persisted to Firestore.
- `recorded` — user annotation: in-progress sleep (NapActionButton),
  owner-only drawer edit, or scheduling intent. Carries `annotatedAt: TimeMin`.
- `completed` — time-committed recording: FAB-create, drawer time-edit,
  or End Nap (TIME_EDIT action). Carries `committedAt: TimeMin`.

"In progress" is a **time property**, not a state: a `recorded` event is
in-progress when `startTime ≤ now < effectiveEndOf(event)`. No separate
`started` state is needed.

### R2.2 Allowed status transitions

```
projected → recorded         (NapActionButton "Start Nap Now", or drawer owner-only edit)
projected → completed        (FAB-create OR drawer time-edit)
recorded  → completed        (TIME_EDIT action — End Nap, or drawer time commit)
recorded  → recorded         (subsequent drawer owner-only edit — annotatedAt unchanged)
completed → completed        (drawer re-edit; idempotent)
```

`projected` never enters Firestore. Other transitions create OR update a
Firestore doc.

- **Why**: dropping `started` removes a redundant state — "in progress"
  is computable from time, not from lifecycle. Dropping `overridden`
  removes a misleading name — the user is *recording* intent, not
  overriding the engine.

### R2.3 `isRecorded()` predicate

`isRecorded(lifecycle) === true` iff `state ∈ {recorded, completed}`.
The engine's reality-wins guard (`checkRealityWins`) protects these events
from mutation by rules, except `wake_window` events which carry owner
metadata and are intentionally merged-and-dropped by R4.2.

### R2.4 `effectiveEndOf(event, napLen, now)` for in-progress detection

For `recorded` sleep events, the effective end auto-extends past `endTime`
when `now > endTime`, capped at 3 extensions (startTime + 4×napLen).
Used by:
- `inProgressNap` selector (dashboard)
- `expandPutdown` R6.8 gate (render)

The CASCADE cursor uses `endTime` directly (not effectiveEndOf) so that
past naps don't stretch future wake-windows.

---

## §14 Day Lifecycle

### R14.1 Exactly one Day has `status: "active"` at any time

`startNewDay` archives the previous active day in the same Firestore
transaction as creating the new one.

### R14.2 Day lifecycle states: `planned | active | archived`

- `planned` — not currently used by V2 dashboard; reserved.
- `active` — today's day; dashboard shows it.
- `archived` — prior days; surfaced on /history.

### R14.3 A day without `wakeTime` can't project

Engine returns empty events. Dashboard shows the "Start New Day" prompt.

### R14.4 The new day begins when bedtime ends

V3 treats bedtime/overnight as a duration event with a definite end:
the user taps **End Bedtime** (alias: "Wake Up" / "Start Day") on the
prior day's bedtime block. That tap closes yesterday's bedtime
(`endTime = now()`) and creates today's Day record with
`wakeTime = now()`. The two are the same action, expressed from
yesterday's frame of reference.

- **Why**: between bedtime start and bedtime end, the engine assumes
  the baby is asleep. Modeling overnight as a single duration removes
  the ambiguous "post-bedtime, pre-tomorrow" gap.
- **Edge case it prevents**: bottles, naps, or other events being
  projected into the overnight window before the user has actually
  started the new day.

### R14.4.1 No standalone "Start New Day" button

The dashboard does NOT carry a dedicated Start-New-Day surface. Day
creation is a side-effect of ending bedtime (R14.4). This frees the
dashboard space previously occupied by Start-New-Day for live status
or other contextual actions; specific reuse is open and decided after
the V3 engine rebuild ships.

The only fallback path: if no active day exists AND no prior bedtime
is open (cold start, fresh install, archived yesterday with no
bedtime), the dashboard offers a one-tap "Start Day" affordance.

### R14.5 Each Day owns its own events collection

Events are nested under `days/{dayId}/events/{eventId}`. Archiving a
day doesn't move events; queries by dayId still work.

### R14.6 Bedtime extends visually past midnight; events past 24:00 belong to "today"

A bedtime event at `19:00` with endTime `"30:00"` displays as part of
today's timeline. The next day starts when "Start New Day" is tapped
(typically next morning).

---

## §19 Settings

### R19.1 Settings doc per child

Path: `children/{childId}/settings/main` or similar. V3 should confirm
whether multi-child is in scope (probably not, per OUT_OF_SCOPE).

### R19.2 First-run uses `defaultSettings(childId)`

The Settings page renders against defaults if no doc exists; first save
creates the doc.

### R19.3 Default values (V3 schema; some are renamed/added vs V2)

Existing fields:
- `defaultBottleAmountOz`: 5
- `defaultBottleIntervalMinutes`: 180
- `defaultNapLengthMinutes`: 60
- `putdownLeadMinutes`: 15
- `bedtimeThreshold`: "19:00" (now a *trigger*, not a clip — see ENGINE_SPEC.md R7.6)
- `shortNapThresholdMinutes`: 35
- `shortNapAdjustmentMinutes`: 10
- `wakeWindowsMinutes`: [120, 135, 135, 150]
- `bottleRules`: [{0–5.5 → 150}, {5.6+ → 180}]
- `dreamFeed`: `{ enabled: boolean; time?: TimeMin }` — `enabled`
  remains as a render-time opt-in flag. Note: `dreamFeedStart`,
  `dreamFeedEnd`, and `dreamFeedOffsetAfterBedtimeMinutes` have been
  removed post-simplification; dream feed is now a render-only label
  with no engine-side time math. See [RENDER_SPEC.md](RENDER_SPEC.md)
  and `../_archive/v3/SIMPLIFICATION_SCOPE.md §3`.
- `pumpTimes`: ["10:30", "14:30"]
- `minBottleIntervalMinutes`: 20
- `timelineColorMode`: "type"
- `timelinePxPerHour`: 120
- `timelineDimPast`: true

V3 additions:
- `defaultWakeTime`: "07:00" (drives bedtime endTime — ENGINE_SPEC.md R7.1)
- `bottleChain`: { bottlesPerDay: number;
  bufferAfterWakeMinutes: number } — expected lower limit of daily
  intake plus the wake-to-first-placeholder buffer (default 10) that
  anchors the placeholder projection per ENGINE_SPEC.md R5.11. No upper
  bound and no fixed `latestProjectedStart`; both are derived from the
  cascade (R5.8). Configurable per child.
- `pumpOwnerSlot`: "parent2" (drives pump owner default — ENGINE_SPEC.md R12.8)
- `dailyRecurring`: [] (replaces `cookDinner` — ENGINE_SPEC.md §11)
- `owners`: { parent1: {displayName, color}, parent2: {...},
   other: [...] } (configurable owner slots — R1.7)
- `daycare`: { enabled, dropoffTime, pickupTime, ownerId } (ENGINE_SPEC.md §21).
  `ownerId` references an `owners.other[]` entry. Default disabled;
  when first enabled, prompt user to confirm/create the daycare
  owner entry.

V3 removed:
- `cookDinner` (subsumed by `dailyRecurring`; migrated on read)

---

## §20 Persistence (Firestore)

### R20.1 All mutations are optimistic at the UI layer

`useEvents.createOptimistic` updates local state synchronously, then
fires the Firestore write. UI is committed before persistence
confirms.

### R20.2 No retry, no rollback on write failure

V2 assumes writes succeed. V3 should consider a failure surface for
the small % of writes that hit network errors.

### R20.3 Firestore converters coerce missing `kind` and `recorded`

Legacy docs without these fields are coerced via `deriveKind` and
`deriveRecorded`. V3 should track when this fallback can be removed
(once Firestore confirms zero docs without the fields).

### R20.4 `eventKey` uniqueness within a day is NOT enforced at the database

Multiple docs with same eventKey can exist (Start+End pair, or stale
manual overrides). Engine must dedupe by eventKey.

### R20.5 Day collection: `days/{dayId}` with subcollection `events/`

Days are top-level under children. Events are nested under their day.

### R20.6 Settings, Templates, Days, Events all live under `children/{childId}`

Multi-child path-prefix already exists; multi-child UI is out of scope
for V3 (see OUT_OF_SCOPE).

---

## §22 Membership Management

> Replaces V2's hardcoded allowlist (`src/lib/auth/allowlist.ts` +
> `firestore.rules`) with a settings-managed list of co-parent emails.
> This is the "lightweight sharing" feature; full role-based sharing
> stays out-of-scope (`OUT_OF_SCOPE.md` §2).

### R22.1 Allowlist lives in Firestore at `config/allowlist`

```ts
type AllowlistDoc = {
  emails: string[];           // lowercase, deduped
  updatedAt: Timestamp;
  updatedBy: string;          // email of the member who last edited
};
```

The doc is a top-level singleton at `/config/allowlist`. Initial
seed: `["jake136@yahoo.com", "kellyrbarber@gmail.com"]`. Once V3
ships, the hardcoded `ALLOWLISTED_EMAILS` constant is deleted.

### R22.2 All members have equal full-access permissions

There is no role gradient. Every email in the allowlist gets the same
read/write access as every other email. View-only and tiered roles
are explicitly out-of-scope (`OUT_OF_SCOPE.md` §2 — confirmed-out).

### R22.3 Firestore rules check membership via `get()` lookup

```js
function isAllowlisted() {
  return request.auth != null
    && request.auth.token.email in
       get(/databases/$(database)/documents/config/allowlist).data.emails;
}
```

The `config/allowlist` doc itself is readable by any authenticated
user (so the client can subscribe). It's writable only by current
members.

### R22.4 Settings page exposes a "Members" section

UI rules:
- Lists current member emails with their join date (if known) and a
  remove button next to each.
- "Add member" input: validates email format. On save, lowercases and
  dedupes.
- Adding an email persists to `config/allowlist.emails` and stamps
  `updatedBy = currentUser.email`.

### R22.5 Removing members has guards

- A member can remove anyone, including themselves, EXCEPT: the last
  remaining member cannot be removed (the operation would orphan the
  data and lock everyone out).
- Removing yourself triggers a confirm: "You'll be signed out and
  lose access. Continue?" On confirm: remove email, sign out, redirect
  to sign-in (where the now-non-allowlisted email will be rejected).
- Removing another member triggers a softer confirm: "Remove
  `email@example.com`? They'll lose access immediately."

### R22.6 Adding an email does NOT send an invitation

The user being added must already have a Google account matching that
email and must sign in via Google to gain access. There is no email,
SMS, or in-app notification to the new user — communication is the
adding member's responsibility (out-of-band).

- **Why**: invitation flows are the heavy version covered by
  OUT_OF_SCOPE §2. R22 stays light.
- **Edge case it prevents**: misspelled emails sitting in the
  allowlist forever — the worst that happens is dead-string rows.

### R22.7 Email comparison is case-insensitive

All writes lowercase the email; the rule check uses the exact stored
form against `request.auth.token.email` (which is always lowercase
for Google-issued tokens).

### R22.8 The client `isAllowlisted()` subscribes to the doc

```ts
// src/lib/auth/allowlist.ts (V3 — replaces hardcoded constant)
export function useAllowlist(): { emails: string[]; loading: boolean } {
  // onSnapshot to /config/allowlist; cached in a context provider
}
```

The auth flow blocks on the first allowlist read; subsequent updates
propagate live (so a removed user gets bounced within seconds without
a refresh).

### R22.9 First-time setup seeds the allowlist if missing

If the V3 build runs against a Firestore where `/config/allowlist`
doesn't exist:
1. The very first authenticated request reads `null` → auth treats
   nobody as allowlisted (closed-by-default).
2. A one-time CLI/seed script (`pnpm seed:allowlist`) writes the doc
   with the founding member set.
3. Documented in `README.md` setup steps.

This avoids a chicken-and-egg deploy where the rules require the doc
but the doc can't be written because the rules require the doc.

### R22.10 Membership changes log to an activity collection (optional, behind flag)

Each add/remove can optionally write a row to `/config/allowlist_log`
with `{ action, target, actor, at }`. Defaults off; useful for audit
if the founding members want it.

(Mark as `OPEN`: ship this in V3 or punt to V4? Recommend punting —
trivial to add later, no audit demand right now.)
