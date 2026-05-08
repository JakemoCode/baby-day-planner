# V3 Out of Scope

> Explicit non-goals for V3. Each item proposed by Claude with a
> rationale; **Jake to ratify** by editing `Status` to `confirmed`,
> `included` (move to scope), or `revisit-later` (push to v4 backlog).

> Why this doc matters: the V3 rewrite has one job — replace V2's
> ad-hoc engine with a declarative one. Every additional feature
> doubles risk. Listing what we're NOT doing is at least as important
> as listing what we are.

> Default state: every item below is **proposed-out**. Jake confirms
> or moves to scope before Phase 1 begins.

---

## Status legend

- `proposed-out` — Claude's recommendation: not in V3.
- `confirmed-out` — Jake agrees; not in V3, on the v4+ backlog.
- `moved-in` — Jake disagrees; promoted to V3 scope.
- `revisit-later` — push the decision to mid-V3 when more is known.
- `fast-follow` — not in V3 engine rebuild; tracked separately in
  `docs/v3/FAST_FOLLOW.md` to land soon after V3 ships.

---

## §1 — Multi-child support

**What it is**: supporting more than one baby per Firebase project /
Settings / Day collection.

**Status**: `confirmed-out`

**Rationale**: V2 already namespaces under `children/{childId}` so the
data model is multi-child capable; the UI is single-child only. Adding
a child picker, per-child Settings, child-scoped templates, and
"current child" navigation is a meaningful design surface. Aden is the
only kid; this can wait until there's a second.

**If Jake disagrees**: scope explodes by ~2 weeks (settings, picker,
nav, child-creation flow). Worth it only if a second baby is imminent.

---

## §2 — Sharing with non-allowlisted users (role-based / view-only)

**What it is**: invitation-flow sharing with **non-co-parent** users —
e.g., grandma gets read-only; babysitter gets edit-only-bottles. Per-doc
ACLs, role definitions, invitation tokens, role-based UI gating.

**Status**: `confirmed-out` ✓ (Jake review 5, 2026-05-08).

**Rationale**: heavy. Per-doc ACLs in Firestore rules, role taxonomy,
invitation token issuance/redemption, role-aware UI gating. ~2–3 weeks
of design + build, much of it auth/security work where bugs are
expensive.

**Distinction from §2.5**: §2.5 (moved-in) is settings-managed
membership of *full co-parents* — anyone an existing member adds gets
the same access as the existing members. §2 is everything beyond
that: tiered roles, view-only guests, time-bound invitations.

**v4 candidate**: yes. Build §2.5 first, learn from it, then design
roles based on actual usage.

---

## §2.5 — Settings-managed allowlist (full co-parent access)

**What it is**: any current allowlisted member can add/remove emails
via a Settings UI. New members get the same full access as existing
members — no role gradient. Replaces the hardcoded allowlist in
`src/lib/auth/allowlist.ts` + `firestore.rules`.

**Status**: `moved-in` ✓ (Jake review 5, 2026-05-08).

**Where it lands**:

- `REQUIREMENTS.md` §22 Membership Management.
- `ARCHITECTURE_V3.md` §1 data model (new `config/allowlist` doc;
rules change to `get()` membership check).

**Rationale (why it makes V3)**: removes the lockstep-deploy headache
(currently changing the allowlist requires editing two files +
redeploying Firestore rules). Realistic near-term need: "add Kelly's
mom as a third co-parent." ~1 day of work; touches data model and
auth, which are V3-shaped concerns.

**Out-of-scope sub-features (push to §2 V4)**:

- Tiered roles (admin / editor / viewer).
- Invitation tokens with expiry.
- Per-doc ACLs.
- Read-only mode in the UI.

---

## §3 — Per-day suppression of recurring projections

**What it is**: ability to skip cook_dinner (or any recurring projected
event) on a specific day without disabling globally in Settings.

**Status**: `moved-in` ✓ (Jake review 1, 2026-05-08)

**Where it landed**: `REQUIREMENTS.md` R11.6 — `Day.suppressedRecurringIds: string[]`. The drawer adds a "Skip today only" action for projected
recurring events; tapping appends the recurring template's id to the
active day's suppression list.

---

## §4 — CSV / JSON export of historical days

**What it is**: a "download my data" button that emits a CSV or JSON of
all events from archived days.

**Status**: `confirmed-out`

**Rationale**: nice-to-have, no immediate pull, requires designing the
schema, writing Firestore queries to span days, file generation, etc.
Couple of days of work, zero impact on V3's core value (engine
reliability).

**v4 candidate**: yes, but probably bundled with multi-child or
sharing.

---

## §5 — Push notifications / reminder alerts

**What it is**: "Bottle in 5 min" or "Daycare hasn't started Nap 3"
push notifications via FCM or web push.

**Status**: `confirmed-out`

**Rationale**: web push is unreliable on iOS Safari (the primary device
target). Adding FCM means an extra Firebase product, server-side cron
jobs, permission UX. Big new surface area; orthogonal to V3 engine
work.

**v4 candidate**: maybe, after PWA + service worker (Wave 9) lands.

---

## §6 — Voice input ("hey, I just bottle-fed")

**What it is**: tap a mic button, say "started a nap," recorder
transcribes and creates the event.

**Status**: `confirmed-out`

**Rationale**: cool, novel, but requires speech-to-text (additional
service or browser API), grammar parsing, error recovery UX. Probably
weeks of polish.

**v5 candidate**: yes, would be excellent for hands-free Daycare /
nighttime use. After V3 + Wave 9.

---

## §7 — iOS / Android native widgets

**What it is**: home-screen widget showing "next event," lock-screen
quick-tap to log a bottle.

**Status**: `confirmed-out`

**Rationale**: requires native code (Swift/Kotlin) or significant
PWA-widget integration work. Far outside the web-app scope.

**v5+ candidate**: pure ambition territory.

---

## §8 — Rich event analytics / charts

**What it is**: "your baby's nap durations over the last month" line
charts, "average wake window length by week" trends, etc.

**Status**: `confirmed-out`

**Rationale**: legitimately useful for tracking developmental shifts,
but a separate page, separate data queries, charting library
integration. Has a dedicated history view feel.

**v4 candidate**: yes, naturally pairs with CSV export (§4).

---

## §9 — Multiple OwnershipTemplates per day-type

**What it is**: ability to switch templates within a day (e.g.,
"morning Daycare schedule" + "afternoon Mom schedule") OR pick from
multiple Saturday templates.

**Status**: `confirmed-out`

**Rationale**: V2 has one template per day. Real life sometimes has
mid-day swaps. Engine could express this with a `template` array, but
the UI for picking and the rules for switching are non-trivial.

**v4 candidate**: yes, paired with §10.

---

## §10 — "Scenarios" — templates that change as the day progresses

**What it is**: a template system that switches templates mid-day
based on context (weekday auto-pick, calendar overrides, "by 10am
cascade has shifted N hours, switch to Daycare-mode," etc.).

**Status**: `confirmed-out` ✓ (Jake review 4, 2026-05-08; ARCHITECTURE
Q7).

**Rationale**: most of the imagined value is already covered:

- Weekday auto-pick (M–F vs Sat–Sun) → handled by
`Settings.daycare.weekdays` (R21.2) + manual template selection at
start-of-day.
- Mid-day caregiver swaps → handled by drawer owner edits +
`daily_recurring` per-day suppression.
- Calendar overrides (holidays/travel) → rare; manual template
selection covers the cases that arise.

The remaining value (full auto template selection by date/calendar)
requires a calendar dependency, an exception-management UI, and rules
engine state for "today switched modes" — heavy machinery. If a real
pattern emerges in usage ("I keep forgetting to flip Saturday from
Weekday template"), revisit V4 with the narrow question
"auto-pick template by weekday?" — far cheaper than a general
scenario system.

**v4 candidate**: only if usage data shows a clear pattern.

---

## §11 — Settings collapsible accordion

**What it is**: from the V2 backlog. Make the settings page sections
collapsible.

**Status**: `fast-follow` ✓ (Jake review 5, 2026-05-08).

**Rationale**: not engine-related; pure UI polish. Tracked in
`docs/v3/FAST_FOLLOW.md` to land after V3 engine ships. Not blocking
V3 Phase 1.

---

## §12 — Palette refresh (the 🔥 bumped twice item)

**What it is**: from V2 backlog: too much white, owner tints invisible.

**Status**: `fast-follow` ✓ (Jake review 5, 2026-05-08).

**Rationale**: not engine-related. Originally recommended as
pre-V3 to lock the visual baseline for Phase 2 differential testing
— but the philosophy carve-out table (ARCHITECTURE §6.4) means
Phase 2 is testing engine-output equivalence, not pixel parity, so
palette can shift safely during/after V3 build. Tracked in
`docs/v3/FAST_FOLLOW.md`.

---

## §13 — Pump amount tracking

**What it is**: V2 pumps don't track ounces produced. Could add an
optional `amountOz` field to pump events.

**Status**: `confirmed-out` for V3, but **trivially addable later**.

**Rationale**: pumps in V2 are "I pumped, here's the time." Extending
to "I pumped, here's the time and the amount" doesn't change engine
shape — it's a single optional field. Can land any time (V3 or v4)
without rewrite implications.

---

## §14 — Multi-day rolling overview

**What it is**: a "this week" view showing 7 days side-by-side.

**Status**: `confirmed-out`

**Rationale**: requires a new layout, projection across multiple days
(does the engine project tomorrow too? what about owner inheritance
across days?), navigation pattern. Big.

**v4 candidate**: yes, after analytics (§8).

---

## §15 — Editable hour grid (drag events to reschedule)

**What it is**: drag-and-drop a nap on the timeline to change its
time without opening the drawer.

**Status**: `confirmed-out`

**Rationale**: requires touch gesture handling, conflict resolution
mid-drag, optimistic preview. The handoff doc mentioned this as an
"optional" capability; V2 didn't ship it; V3 won't either.

**v4 candidate**: maybe. Pleasant but not load-bearing.

---

## §16 — Light/dark mode

**What it is**: respect `prefers-color-scheme` for an automatic dark
mode.

**Status**: `confirmed-out` (matches V2 locked decision).

**Rationale**: light mode only is a confirmed locked decision in
project memory. Dark mode would require palette work that doesn't
exist. Not changing this.

---

## §17 — Onboarding flow / first-time setup wizard

**What it is**: a guided "tell us about your baby" wizard that
populates Settings on first run.

**Status**: `confirmed-out`

**Rationale**: V2 ships with sensible defaults; users edit Settings as
needed. A wizard is nicer but not essential.

**v4 candidate**: yes, especially if multi-child (§1) lands — each
new child needs setup.

---

## §18 — Calendar / iCal integration

**What it is**: export the day to .ics for syncing with iOS Calendar
/ Google Calendar.

**Status**: `confirmed-out`

**Rationale**: useful for "Cook Dinner at 5pm" reminders, less useful
for live nap tracking. Adjacent to push notifications (§5).

**v5 candidate**: revisit when there's a clear use case.

---

## §19 — Real-time multi-device sync indicator

**What it is**: "Kelly is editing Nap 2 right now" presence indicator.

**Status**: `confirmed-out`

**Rationale**: Firestore's snapshot listeners give us eventual
consistency in seconds. Active presence is overkill for the 2-user
case.

---

## §20 — Backup / restore mechanism

**What it is**: weekly backup of all Firestore data to user-controlled
storage; one-click restore on data loss.

**Status**: `confirmed-out`

**Rationale**: Firebase has its own backup story (point-in-time
recovery for Firestore). Not the user's job at this scale.

---

## §21 — Internationalization (i18n)

**What it is**: support languages other than English.

**Status**: `confirmed-out`

**Rationale**: Jake + Kelly are English speakers. No demand. Adding
i18n means parameterizing every string, adding a translation infra,
designing date/time formatting per locale (already pseudo-handled with
Intl.DateTimeFormat).

---

## §22 — Server-side rendering of the timeline

**What it is**: rendering the timeline as static HTML on the server
for faster initial paint or SEO.

**Status**: `confirmed-out`

**Rationale**: this is a private app behind auth. SSR doesn't help —
the page is gated behind sign-in. Initial render is already fast on
modern devices.

---

## §23 — Switch from Firestore to a different backend

**What it is**: migrate from Firestore to Postgres / Supabase / etc.

**Status**: `confirmed-out`

**Rationale**: Firestore works. Auth works. The cost story is fine for
two users. Migrating storage is weeks of work for zero user-visible
benefit.

**v∞ candidate**: only if we hit a real Firestore wall (cost, query
limitations, vendor lock-in pain).

---

## §24 — AI assistant ("did Aden have his bedtime bottle?")

**What it is**: a conversational interface that answers questions
about the baby's day from event data.

**Status**: `confirmed-out`

**Rationale**: cool but unnecessary. The dashboard answers most
questions visually.

**v∞ candidate**: maybe a fun side project once everything else is
stable.

---

## §25 — V3 introduces only the explicitly-scoped new event types

**What it is**: the no-new-event-types rule, with carve-outs for the
types Jake has explicitly scoped into V3.

**Status**: `confirmed-out` for everything except the in-scope
additions (Jake review 5, 2026-05-08).

**In V3 scope** (added during planning, NOT covered by this rule):
- `daycare_dropoff` (R21.1, instant)
- `daycare_pickup` (R21.1, instant)
- `daily_recurring` (R11, generalizes V2's `cook_dinner`)

**Out of scope for V3**: everything else — diaper change, medication,
doctor visit, solid-food meals, tummy-time, etc.

**Rationale**: "extra" already covers ad-hoc events. New first-class
event types each need their own rules, icons, template owner arrays,
and Settings surface. Daycare and daily_recurring earned their
first-class status because they have engine-side behavior (window
auto-assign, suppression). New types without that behavior stay as
`extra` until pattern emerges.

**v4 candidate**: yes, individually, as needs surface.

---

## §26 — Schema-level migrations (renaming fields, restructuring docs)

**What it is**: a one-shot migration job that rewrites all V2 Firestore
docs into V3 shape.

**Status**: `confirmed-out`

**Rationale**: V3 reads V2 docs via the converter (no migration job
needed). New writes use V3 shape. Within ~6 weeks of normal use, all
active docs will have been touched and rewritten naturally. Avoid the
risk of running a migration script against production.

---

## §27 — Settings-level user customization of rule weights / thresholds beyond what V2 already exposes

**What it is**: e.g. "weight short-nap adjustment more aggressively"
or "tune the bottle-overlap heuristic."

**Status**: `confirmed-out`

**Rationale**: V2 exposes the right settings (`shortNapThresholdMinutes`,
`shortNapAdjustmentMinutes`, etc.). Adding rule-weight settings means
exposing engine internals to users; brittle and over-flexible.

---

## §28 — Notion / web-clipper-style "save this event"

**What it is**: chrome extension or share-sheet target to add events
from external apps.

**Status**: `confirmed-out`. v∞.

---

## §29 — Bulk operations ("delete all bottles before noon")

**What it is**: multi-select on the timeline + bulk delete / edit.

**Status**: `confirmed-out`. Rare use case; per-event edit covers it.

---

## §30 — Watch app companion

**What it is**: Apple Watch / Wear OS app with quick-tap recording.

**Status**: `confirmed-out`. v∞.

---

## Summary

V3's job: replace the engine. Everything else listed here is
**deliberately deferred**.

If Jake disagrees with any item: change `Status` to `moved-in` and
add it to V3's scope. The line items below the (recommended)
**moved-in** ones must then move to OUT_OF_SCOPE-confirmed or be
explicitly punted to v4+.

---

## Action — Jake's review

For each item, change one of:

- `proposed-out` → `confirmed-out` (no V3, on v4+ backlog).
- `proposed-out` → `moved-in` (add to V3 scope).
- `proposed-out` → `revisit-later` (decide mid-V3).

Items resolved during review:

- **§2** — Sharing with non-allowlisted users: `confirmed-out`
- **§2.5** — Settings-managed allowlist: `moved-in` (REQUIREMENTS §22)
- **§3** — Per-day suppression: `moved-in` (R11.6)
- **§10** — Scenarios: `confirmed-out` (covered by daycare weekdays
  + manual templates)
- **§11** — Settings accordion: `fast-follow` (FAST_FOLLOW.md §F1)
- **§12** — Palette refresh: `fast-follow` (FAST_FOLLOW.md §F2)
- **§25** — New event types: scoped to daycare + daily_recurring
  (others remain `confirmed-out`)

V3 Phase 1 is unblocked.