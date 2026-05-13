# V4 Vision — Intake-Driven, Age-Aware Projection

**Status**: vision, not spec. Captured 2026-05-13.

> Direction for AFTER v3 simplification + wave 9 + real daily use.
> Not in scope now. Its job is to keep current PRs from cementing
> decisions v4 would want different.

## §1 The shift

Today: user configures ~10 numeric settings (`bottlesPerDay`,
`wakeWindowsMinutes`, `bedtimeThreshold`, `defaultNapLengthMinutes`,
…) that describe baby's schedule.

v4: engine knows baby's **date of birth**, looks up a **reference
table** (seeded from `DOMAIN.md` §8), and **derives** the defaults.
Per-family overrides still possible. Defaults update as baby ages.

## §2 What changes

- **Schema**: add `Child.dateOfBirth`. That's it.
- **New module** `engine/ageReference.ts`: bands (0-2 / 2-4 / 4-6 /
  6-9 / 9-12 / 12+ months), each carrying typical
  wake-window, naps/day, feeds/day, oz/feed, daily intake, sleep-
  cycle length, bedtime-emerged flag, overnight-feeds expectation.
- **Settings thins out**. `bottlesPerDay`, intervals, wake windows,
  `bedtimeThreshold`, nap length, short-nap params — all derived
  with override. Render-time settings (`putdownLeadMinutes`,
  `bufferAfterWakeMinutes`, `minBottleIntervalMinutes`,
  `bottleIntervalRules`) stay as preferences.
- **Cascade math becomes intake-driven**: target = `dailyIntakeOz`
  for the age band; remaining slots size themselves to hit it.
  Still predict-don't-prescribe — adjusts as reality lands.
- **Bedtime emergence is age-aware**: younger ages
  (`!bedtimeEmerged`) have no distinct bedtime → cascade flows
  through the night naturally. Subsumes the `projectOvernight`
  question.

## §3 What stays

Schema (except DOB), lifecycle discriminated union, rule registry +
topo-sorted evaluator, predict-don't-prescribe, midnight rule,
reality wins, Firestore plumbing, most of render. v4 is **age-aware
defaults**, not architectural reset.

The current v3 simplification work (fewer, sharper rules) is the
right preparation.

## §4 What this is NOT

Not a spec, not a near-term plan, not a rewrite. Don't pick up
tasks from this doc — it's a compass.

## §5 Signals to begin v4

- v3 simplification execution plan (`SIMPLIFICATION_SCOPE.md` §8)
  complete.
- `FAST_FOLLOW.md` meaningfully drained.
- Wave 9 (PWA + E2E + design audit) done.
- Jake and Kelly using the app daily long enough to feel where
  current settings cause friction.
- §F10 (DOB onboarding) shipped — soft prerequisite.

If those hit and v4 still doesn't feel needed, that's a valid
outcome too.

## §6 What v4 makes EASIER for current work

Some v3 backlog items shrink or vanish in v4:

| Backlog item | v3 effort | v4 effort |
|---|---|---|
| §F14 Settings defaults audit | tune ~10 numeric settings | trivial (table-derived) |
| §F1 Settings accordion | real UI work | smaller (fewer rows) |
| §F3 First-time onboarding | wizard for ~10 fields | one screen (DOB + names) |
| §F11 Settings Save button | real UI work | smaller |
| `projectOvernight` toggle | setting + UI + engine | doesn't exist (derived) |

→ Don't over-invest in v3 settings UX. §F10 (DOB) is critical-path
for v4 — capture DOB even if v3 doesn't yet use it.

## §7 Open questions (defer until v4 starts)

1. Reference-table granularity (monthly? or DOMAIN.md's bands?)
2. Intake-driven cascade — does it feel right on off-pattern days?
3. Adolescent / toddler bands beyond 12 months
4. Twins / multiples (probably still single-child for v4)
5. Premature babies — adjusted age vs actual age

## §8 Decision log

- 2026-05-13 — Jake: "the better long-term solution here would be
  to have projection be intake-based … perhaps this is useful in
  a v4?" → captured here, not in scope for v3.
- 2026-05-13 — Jake: same model for wake windows + naps. → in
  scope for v4.
- 2026-05-13 — Skipped `projectOvernight` toggle (v4 derives the
  same answer from age band).
- 2026-05-13 — Ordering: v3 simplification + backlog + wave 9 →
  Jake/Kelly use the app → THEN v4.
