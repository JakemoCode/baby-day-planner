# §F35 — Named multi-template support

**Source**: Jake, 2026-05-18 (exploring after F13 picker polish landed).

**Status**: `pending`

**What**: today the day-templates page hardcodes two tabs — Saturday and Sunday — but `OwnershipTemplate` already carries `id` + `displayName` ("Saturday, Half-day Friday, Travel, etc." per the schema comment) and the repository / hook (`useV3Templates`) already model an unbounded list. Open up CRUD on the page (add / rename / delete templates) and let the user assign a template to a specific date.

**Why fast-follow, not now**: Sat/Sun + Tomorrow is enough to plan the immediate week. Real demand for "Travel day", "Half-day Friday", etc. is theoretical until a non-default Wednesday shows up.

**Plumbing already in place** (no engine / persistence changes needed):
- `OwnershipTemplate.id` + `displayName` (schemas.ts).
- `useV3Templates` returns a list; repo writes individually by id.
- `setOwnerInTemplate` is template-agnostic.
- The post-F13 picker chrome (BottomSheet) is name-agnostic — already shows `template.displayName` indirectly via the `title` prop the consumer constructs.

**Design question to settle first — how does a user *assign* a custom template to a future date?** Three plausible patterns:

| Pattern | Pros | Cons |
|---|---|---|
| **A — Manual every day** Tomorrow page exposes a template dropdown. | Simplest mental model. | Repetitive when most days are weekday-default. |
| **B — Weekday defaults + per-date override** *(recommended)* Settings hold `{mon: 'weekday', sat: 'saturday', ...}`; Tomorrow page lets the user override for the specific date. | Keeps the current auto-pick working for the common case. One-shot override is a single tap. | New shape on Settings + lightweight persistence for the override. |
| **C — Calendar / exceptions list** Settings hold `[{date: '2026-06-05', templateId: 'travel'}, ...]`. | Plan a week in advance. | Highest implementation cost; UX needs a date picker. |

**Recommended**: **B**. Smallest delta from today's flow; the weekday auto-pick already works for ~6 days a week.

**Scope** (assuming B, ~1 day):

| Block | Work |
|---|---|
| Template CRUD UI | Add `+ New template` button on `/day-templates`; rename via clicking the tab title; delete via per-tab kebab. Persist to existing repo. |
| Dynamic tabs | Replace hardcoded Sat/Sun JSX with `templates.map(...)`; selected tab persists to localStorage like the settings accordion (reuse `useLocalStorageString`). |
| Tomorrow page override | Add a "Use template" dropdown above the timeline; default selection = weekday auto-pick; manual selection persists to the tomorrow-plan doc (already exists per §F12). |
| Weekday → template defaults | New `Settings.weekdayTemplates` field: `Record<Weekday, templateId>`. Defaulter fills in `sat: 'saturday', sun: 'sunday', mon-fri: 'weekday'` (or `null` if no weekday template). |
| Tests | RTL: template creation + rename + delete; tomorrow page override → persisted; weekday default + override unit test. |

**Acceptance**:
- User can create a named template, rename it, and delete it from the day-templates page.
- All templates appear as tabs; switching tabs persists selection across navigations.
- Tomorrow page surfaces a template selector; default matches the weekday config; user override wins for that date.
- Existing Sat/Sun tabs continue to work (migration: `withV3SettingsDefaults` seeds the weekday defaults map on first read).

**Out of scope**:
- Calendar / multi-date assignment (pattern C). Defer until the override flow proves repetitive.
- Sharing templates across children / accounts.

---


