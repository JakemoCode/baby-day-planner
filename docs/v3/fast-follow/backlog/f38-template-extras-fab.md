# §F38 — Template extras (FAB on `/day-templates`)

**Source**: Jake, 2026-05-18 (during F13 click-test — "shouldn't FAB just be the default way to add extra anything?").

**Status**: `pending`

**What**: extend the FAB / `FABTypePicker` pattern to the day-templates page so a user can add an extra event (bottle / pump / custom) directly onto a template. Adjacent to §F35 — "Travel day" template with a flight at 14:00 is the natural example. Both are the same underlying conceptual feature: **templates can carry events, not just ownership decorations.**

**Why fast-follow, not now**: ship the simpler Tomorrow FAB first (PR-tomorrow-fab) so the FAB pattern is the universal "add anything" affordance on day-shaped pages. Templates need a schema lift first; defer until §F35 (or the next time the user wants a recurring event on a non-default day).

**Current state**:
- `OwnershipTemplate` carries only `napOwners` + `wakeWindowOwners` — owner-slot decorations.
- The engine merges these with projected nap/wake events when a template is applied.
- Templates do NOT carry events of their own. No `extras` field. No engine code that emits events FROM a template.

**Plumbing change required**:

| Block | Work |
|---|---|
| Schema | Add `extras: Event[]` (or `templateExtras: TemplateExtra[]`) to `OwnershipTemplate`. A `TemplateExtra` is an event template (time + type + label + optional owner) that the engine materializes on the assigned day. |
| Engine | New rule (or extension of an existing one) that emits `extras` from the active template as projected events on the day, in addition to the existing nap/ww/bottle/pump cascade. |
| Defaulter | Migrate older templates (which have no `extras`) on read — empty array. |
| UI | FAB on `/day-templates` opens the same `FABTypePicker`. `onSelect` adds an extra to `activeTemplate.extras` and persists. Edit/delete already covered by the existing drawer flow. |
| Date / Tomorrow | `/tomorrow` already gets extras via the FAB. Template extras should also appear in the Tomorrow preview when its weekday-default (or override per §F35) selects that template. |

**Design questions to settle**:

| Question | Options |
|---|---|
| Where do extras live on the doc? | Flat `Event[]` (denormalized) vs. a thinner `TemplateExtra` shape with just the time/type/label and owner. **Lean: thinner shape** — Event has lifecycle/dayId fields that don't belong on a re-usable template. |
| How does the engine identify a template-emitted event vs a recorded extra? | `lifecycle.state = "projected"` + a marker like `source: "template"` so the existing recorded-wins rule still applies cleanly. |
| Edit vs override per day? | Editing a template extra on Tomorrow's preview should NOT mutate the template — that's an override for the specific date (like recording an actual event). Same recorded-wins semantics. |

**Acceptance**:
- User can FAB-add a bottle/pump/custom to Sat or Sun template.
- The added event appears on `/day-templates` preview at its time.
- On `/tomorrow` for a date whose template carries the extra, the preview shows it as a projected event.
- Promoting Tomorrow → today materializes template extras as recorded events on the new day doc.
- Editing the extra on tomorrow's preview overrides for that date only — the template stays unchanged.
- Recorded actuals still win over template-projected extras on the same date.

**Out of scope**:
- Recurring extras (weekly, daily) — covered separately by `Settings.dailyRecurring` which already exists for a single repeating event.
- Time-shifted extras (e.g., "5h after wake" vs "at 12:00") — start with fixed times.

**Estimated effort**: ~2-3 days. Schema + engine rule + defaulter migration + UI + ~6-8 new tests (engine emit + recorded-wins-over-template-extra + round-trip + UI add/edit/delete + Tomorrow integration).

---


