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

---

## §1 — Multi-child support

**What it is**: supporting more than one baby per Firebase project /
Settings / Day collection.

**Status**: `proposed-out`

**Rationale**: V2 already namespaces under `children/{childId}` so the
data model is multi-child capable; the UI is single-child only. Adding
a child picker, per-child Settings, child-scoped templates, and
"current child" navigation is a meaningful design surface. Aden is the
only kid; this can wait until there's a second.

**If Jake disagrees**: scope explodes by ~2 weeks (settings, picker,
nav, child-creation flow). Worth it only if a second baby is imminent.

---

## §2 — Sharing with non-allowlisted users

**What it is**: letting parents share their baby's day with grandparents,
neighbors, etc. — read-only or limited-edit views with auth.

**Status**: `proposed-out`

**Rationale**: current allowlist is `jake136@yahoo.com` +
`kellyrbarber@gmail.com`. Adding a "view-only guest" mode means
expanding the auth model (per-doc ACLs in Firestore rules), invitation
flow, role-based UI gating. Heavy.

**If Jake disagrees**: scope explodes by ~2-3 weeks. Better fit for v4.

---

## §3 — Per-day suppression of recurring projections

**What it is**: ability to skip cook_dinner (or any recurring projected
event) on a specific day without disabling globally in Settings.

**Status**: `moved-in` ✓ (Jake review 1, 2026-05-08)

**Where it landed**: `REQUIREMENTS.md` R11.6 — `Day.suppressedRecurringIds:
string[]`. The drawer adds a "Skip today only" action for projected
recurring events; tapping appends the recurring template's id to the
active day's suppression list.

---

## §4 — CSV / JSON export of historical days

**What it is**: a "download my data" button that emits a CSV or JSON of
all events from archived days.

**Status**: `proposed-out`

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

**Status**: `proposed-out`

**Rationale**: web push is unreliable on iOS Safari (the primary device
target). Adding FCM means an extra Firebase product, server-side cron
jobs, permission UX. Big new surface area; orthogonal to V3 engine
work.

**v4 candidate**: maybe, after PWA + service worker (Wave 9) lands.

---

## §6 — Voice input ("hey, I just bottle-fed")

**What it is**: tap a mic button, say "started a nap," recorder
transcribes and creates the event.

**Status**: `proposed-out`

**Rationale**: cool, novel, but requires speech-to-text (additional
service or browser API), grammar parsing, error recovery UX. Probably
weeks of polish.

**v5 candidate**: yes, would be excellent for hands-free Daycare /
nighttime use. After V3 + Wave 9.

---

## §7 — iOS / Android native widgets

**What it is**: home-screen widget showing "next event," lock-screen
quick-tap to log a bottle.

**Status**: `proposed-out`

**Rationale**: requires native code (Swift/Kotlin) or significant
PWA-widget integration work. Far outside the web-app scope.

**v5+ candidate**: pure ambition territory.

---

## §8 — Rich event analytics / charts

**What it is**: "your baby's nap durations over the last month" line
charts, "average wake window length by week" trends, etc.

**Status**: `proposed-out`

**Rationale**: legitimately useful for tracking developmental shifts,
but a separate page, separate data queries, charting library
integration. Has a dedicated history view feel.

**v4 candidate**: yes, naturally pairs with CSV export (§4).

---

## §9 — Multiple OwnershipTemplates per day-type

**What it is**: ability to switch templates within a day (e.g.,
"morning Daycare schedule" + "afternoon Mom schedule") OR pick from
multiple Saturday templates.

**Status**: `proposed-out`

**Rationale**: V2 has one template per day. Real life sometimes has
mid-day swaps. Engine could express this with a `template` array, but
the UI for picking and the rules for switching are non-trivial.

**v4 candidate**: yes, paired with §10.

---

## §10 — "Scenarios" — templates that change as the day progresses

**What it is**: a template system that says "by 10am, cascade has
shifted by X hours? auto-trigger Daycare-mode template instead of
Saturday-mode."

**Status**: `proposed-out`

**Rationale**: this is real complexity. The rules engine could express
it (rules are already conditional on day state) but the UX of "today
just switched modes" is hairy.

**v4 candidate**: revisit if Jake's daily life genuinely needs it.

---

## §11 — Settings collapsible accordion

**What it is**: from the V2 backlog. Make the settings page sections
collapsible.

**Status**: `proposed-out` for V3 engine work, but **could land as a
V2 follow-up** independently.

**Rationale**: not engine-related; pure UI polish. If Jake wants it,
it's a 1-day side PR against V2 main, separate from V3 prep / build.

---

## §12 — Palette refresh (the 🔥 bumped twice item)

**What it is**: from V2 backlog: too much white, owner tints invisible.

**Status**: `proposed-out` for V3 engine work, **strongly recommend
landing as a V2 follow-up before V3 build starts**.

**Rationale**: not engine-related; will affect the visual baseline
that V3's rules-engine version compares against in Phase 2. Better
to lock the palette during the V3 build, not while V3 is shipping.

**Action**: ship a small V2 PR for palette refresh during the
"awaiting V3 plan ratification" phase. Don't bundle with V3.

---

## §13 — Pump amount tracking

**What it is**: V2 pumps don't track ounces produced. Could add an
optional `amountOz` field to pump events.

**Status**: `proposed-out` for V3, but **trivially addable later**.

**Rationale**: pumps in V2 are "I pumped, here's the time." Extending
to "I pumped, here's the time and the amount" doesn't change engine
shape — it's a single optional field. Can land any time (V3 or v4)
without rewrite implications.

---

## §14 — Multi-day rolling overview

**What it is**: a "this week" view showing 7 days side-by-side.

**Status**: `proposed-out`

**Rationale**: requires a new layout, projection across multiple days
(does the engine project tomorrow too? what about owner inheritance
across days?), navigation pattern. Big.

**v4 candidate**: yes, after analytics (§8).

---

## §15 — Editable hour grid (drag events to reschedule)

**What it is**: drag-and-drop a nap on the timeline to change its
time without opening the drawer.

**Status**: `proposed-out`

**Rationale**: requires touch gesture handling, conflict resolution
mid-drag, optimistic preview. The handoff doc mentioned this as an
"optional" capability; V2 didn't ship it; V3 won't either.

**v4 candidate**: maybe. Pleasant but not load-bearing.

---

## §16 — Light/dark mode

**What it is**: respect `prefers-color-scheme` for an automatic dark
mode.

**Status**: `proposed-out` (matches V2 locked decision).

**Rationale**: light mode only is a confirmed locked decision in
project memory. Dark mode would require palette work that doesn't
exist. Not changing this.

---

## §17 — Onboarding flow / first-time setup wizard

**What it is**: a guided "tell us about your baby" wizard that
populates Settings on first run.

**Status**: `proposed-out`

**Rationale**: V2 ships with sensible defaults; users edit Settings as
needed. A wizard is nicer but not essential.

**v4 candidate**: yes, especially if multi-child (§1) lands — each
new child needs setup.

---

## §18 — Calendar / iCal integration

**What it is**: export the day to .ics for syncing with iOS Calendar
/ Google Calendar.

**Status**: `proposed-out`

**Rationale**: useful for "Cook Dinner at 5pm" reminders, less useful
for live nap tracking. Adjacent to push notifications (§5).

**v5 candidate**: revisit when there's a clear use case.

---

## §19 — Real-time multi-device sync indicator

**What it is**: "Kelly is editing Nap 2 right now" presence indicator.

**Status**: `proposed-out`

**Rationale**: Firestore's snapshot listeners give us eventual
consistency in seconds. Active presence is overkill for the 2-user
case.

---

## §20 — Backup / restore mechanism

**What it is**: weekly backup of all Firestore data to user-controlled
storage; one-click restore on data loss.

**Status**: `proposed-out`

**Rationale**: Firebase has its own backup story (point-in-time
recovery for Firestore). Not the user's job at this scale.

---

## §21 — Internationalization (i18n)

**What it is**: support languages other than English.

**Status**: `proposed-out`

**Rationale**: Jake + Kelly are English speakers. No demand. Adding
i18n means parameterizing every string, adding a translation infra,
designing date/time formatting per locale (already pseudo-handled with
Intl.DateTimeFormat).

---

## §22 — Server-side rendering of the timeline

**What it is**: rendering the timeline as static HTML on the server
for faster initial paint or SEO.

**Status**: `proposed-out`

**Rationale**: this is a private app behind auth. SSR doesn't help —
the page is gated behind sign-in. Initial render is already fast on
modern devices.

---

## §23 — Switch from Firestore to a different backend

**What it is**: migrate from Firestore to Postgres / Supabase / etc.

**Status**: `proposed-out`

**Rationale**: Firestore works. Auth works. The cost story is fine for
two users. Migrating storage is weeks of work for zero user-visible
benefit.

**v∞ candidate**: only if we hit a real Firestore wall (cost, query
limitations, vendor lock-in pain).

---

## §24 — AI assistant ("did Aden have his bedtime bottle?")

**What it is**: a conversational interface that answers questions
about the baby's day from event data.

**Status**: `proposed-out`

**Rationale**: cool but unnecessary. The dashboard answers most
questions visually.

**v∞ candidate**: maybe a fun side project once everything else is
stable.

---

## §25 — V3 introduces zero new event types

**What it is**: not adding new EventTypes (e.g., "diaper change,"
"medication," "doctor visit") in V3.

**Status**: `proposed-out` (intentionally — keep V3 focused on engine
quality, not feature expansion).

**Rationale**: "extra" already covers ad-hoc events. New first-class
event types means new rules, new icons, new template owner arrays.
Each addition is its own scope-defining decision; V3 should be the
substrate that makes adding them easier later, not a place where they
all land at once.

**v4 candidate**: yes, individually, as needs surface.

---

## §26 — Schema-level migrations (renaming fields, restructuring docs)

**What it is**: a one-shot migration job that rewrites all V2 Firestore
docs into V3 shape.

**Status**: `proposed-out`

**Rationale**: V3 reads V2 docs via the converter (no migration job
needed). New writes use V3 shape. Within ~6 weeks of normal use, all
active docs will have been touched and rewritten naturally. Avoid the
risk of running a migration script against production.

---

## §27 — Settings-level user customization of rule weights / thresholds beyond what V2 already exposes

**What it is**: e.g. "weight short-nap adjustment more aggressively"
or "tune the bottle-overlap heuristic."

**Status**: `proposed-out`

**Rationale**: V2 exposes the right settings (`shortNapThresholdMinutes`,
`shortNapAdjustmentMinutes`, etc.). Adding rule-weight settings means
exposing engine internals to users; brittle and over-flexible.

---

## §28 — Notion / web-clipper-style "save this event"

**What it is**: chrome extension or share-sheet target to add events
from external apps.

**Status**: `proposed-out`. v∞.

---

## §29 — Bulk operations ("delete all bottles before noon")

**What it is**: multi-select on the timeline + bulk delete / edit.

**Status**: `proposed-out`. Rare use case; per-event edit covers it.

---

## §30 — Watch app companion

**What it is**: Apple Watch / Wear OS app with quick-tap recording.

**Status**: `proposed-out`. v∞.

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

Items currently flagged for special attention:
- **§3 — Per-day suppression**: I recommend MOVING IN. ~2-3 hours,
  fits the rules engine cleanly, real user value.
- **§11 — Settings accordion**: ship as V2 follow-up, before V3.
- **§12 — Palette refresh**: ship as V2 follow-up, before V3 (locks
  visual baseline for Phase 2 differential testing).

When this doc has all items confirmed/moved/punted with no ambiguity,
V3 Phase 1 can begin.
