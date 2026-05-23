# §F41 — Post-onboarding tutorial / orientation surface

**Source**: Jake, 2026-05-19 — during §F3 click-test. "I hate 'wake up' as the only button on the screen as soon as onboarding is complete."

**Status**: `pending`

**What**: after a fresh §F3 onboarding submission, the user lands on the dashboard with just a single "Start first day" CTA centered on the page. There's no context about what the app does, what the timeline looks like once events are recorded, or what the next interaction should be after the day is started. A short tutorial (coachmarks, a guided tour, or a static "what to expect" panel) would orient a brand-new user.

**Why fast-follow, not now**: §F3 PR #1 ships the bare-minimum welcome flow. Tutorial design is a separate UX project and shouldn't gate first dogfood use (Jake + Kelly already know the app). Becomes important the moment a third user touches the app.

**Acceptance** (sketch — design pass required first):
- First-day-empty state shows more than the "Start first day" CTA — at minimum a short paragraph or 3-bullet "here's what happens next" panel.
- Optional: progressive coachmarks on first dashboard render, first FAB tap, first event recorded.
- Dismissible per-user (write to `/users/{uid}.onboardingComplete` or similar).

**Estimated effort**: 1–2 days for a static "what to expect" panel; 2–3 days for proper coachmarks.

---


