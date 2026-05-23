# §F11 — Settings: explicit Save button + success feedback

**Source**: Jake, 2026-05-10.

**Status**: `pending`

**What**: today the Settings page autosaves on every field change. Two problems:
1. **No user-visible confirmation** — users have no signal that their edits actually persisted; trust comes from "I think it worked"
2. **Unnecessary recalculations during edit** — every keystroke / field tweak retriggers projection, owner-list rebuilds, etc. while the user is mid-thought

Replace with: explicit **Save** button at section or page level + a transient success indicator ("Settings successfully saved" toast / inline confirmation that fades after ~3s). While the form is dirty, projection consumers continue rendering against the last-saved settings — only the save commits.

**Why fast-follow**: pure UX/state-management change; engine-orthogonal. Touches Settings page + the hooks that publish settings to the rest of the app.

**Open design questions** (decide during implementation):
- Per-section save buttons (matches the planned §F1 accordion UX) vs page-level single Save?
- Dirty-form guard on navigation away?
- Optimistic vs pessimistic save (Firestore latency)?

**Acceptance**:
- Editing a field doesn't trigger projection recalc until Save
- Save button disabled when no changes
- Visible success state on commit (toast or inline, accessibility-wired with role="status")
- Discard / reset path for in-progress edits

---


