# V4 Vision — Intake-Driven, Age-Aware Projection

**Status**: vision, not spec. Captured 2026-05-13.

> This doc describes a meaningful architectural shift that should
> happen **after** the v3 simplification cycle and frontend-orchestration
> wave 9 complete, **after** Jake and Kelly are actually using the app
> day-to-day. It is intentionally NOT in scope right now. Its purpose
> is to keep the simplification PRs from accidentally cementing
> decisions that v4 would want different.

---

## §1 The shift in one sentence

Today, the engine asks the user to configure ~10 numeric settings
(`bottlesPerDay`, `defaultBottleIntervalMinutes`, `wakeWindowsMinutes`,
`bedtimeThreshold`, `defaultNapLengthMinutes`, `shortNapThresholdMinutes`,
`shortNapAdjustmentMinutes`, …) that describe a baby's schedule.

In v4, the engine knows the baby's **date of birth**, looks up a
**research-backed reference table** for that age, and **derives**
those defaults. Users can override per-baby, but the defaults Just
Work and update automatically as the baby ages.

This is a direct application of `DOMAIN.md` §8 — the research
reference notes were captured exactly for this purpose.

---

## §2 What changes

### §2.1 Schema additions

Minimal first cut:

```ts
type Child = {
  id: string;
  displayName: string;
  // NEW:
  dateOfBirth: string; // ISO date, e.g. "2026-01-15"
};
```

That's it. One field. Age is `today - dateOfBirth`.

(§F10 in `FAST_FOLLOW.md` already captures the onboarding flow for
DOB — naturally complementary work.)

### §2.2 Reference tables in the engine

Single source of truth for age-driven defaults. Seeded from
`DOMAIN.md` §8.1–§8.3 and refined as needed:

```ts
// src/v3/engine/ageReference.ts (new module)

type AgeBand = {
  // Lower bound inclusive, upper bound exclusive, in months.
  minMonths: number;
  maxMonths: number; // Infinity for the oldest band

  // Sleep
  wakeWindowMinutes: { typical: number; min: number; max: number };
  napsPerDay: number;
  defaultNapLengthMinutes: number;
  // When bedtime is a meaningful daily marker (vs "just another nap")
  bedtimeEmerged: boolean;
  bedtimeThresholdMinutes: number; // ignored if !bedtimeEmerged

  // Feeding
  feedsPerDay: { typical: number; min: number; max: number };
  ozPerFeed: { typical: number; min: number; max: number };
  dailyIntakeOz: { typical: number; min: number; max: number };
  // Overnight feeds expected at this age (yes/tapering/no)
  overnightFeeds: "expected" | "tapering" | "uncommon";
};

const BANDS: AgeBand[] = [
  { minMonths: 0, maxMonths: 2, wakeWindowMinutes: { typical: 50, min: 45, max: 60 }, napsPerDay: 4.5, /* ... */ },
  { minMonths: 2, maxMonths: 4, /* ... */ },
  { minMonths: 4, maxMonths: 6, /* ... */ },
  { minMonths: 6, maxMonths: 9, /* ... */ },
  { minMonths: 9, maxMonths: 12, /* ... */ },
  { minMonths: 12, maxMonths: Infinity, /* ... */ },
];

export function ageBandFor(ageMonths: number): AgeBand { /* ... */ }
```

The bands match `DOMAIN.md` §8.1 (wake windows) and §8.3 (bottle
cadence). One source of truth — the doc captures the user-facing
rationale; the table captures the engine-facing numbers.

### §2.3 Settings becomes thinner

Most numeric defaults disappear from settings:

| Current setting | v4 |
|---|---|
| `defaultNapLengthMinutes` | Derived from age band; user can override |
| `wakeWindowsMinutes` | Derived (array of `napsPerDay` entries at `wakeWindowMinutes`); user can override per-position |
| `bedtimeThreshold` | Derived from age band's `bedtimeThresholdMinutes`; only meaningful if `bedtimeEmerged` |
| `defaultBottleAmountOz` | Derived from `ozPerFeed.typical` |
| `defaultBottleIntervalMinutes` | Derived from `dailyIntakeOz / feedsPerDay` math; user can override |
| `bottleChain.bottlesPerDay` | Derived from `feedsPerDay.typical` |
| `bottleChain.bufferAfterWakeMinutes` | Stays (small preference, not age-dependent) |
| `bottleIntervalRules` | Stays for the "smaller bottle = sooner" UX; works the same |
| `minBottleIntervalMinutes` | Stays (drawer UX guard) |
| `shortNapThresholdMinutes`, `shortNapAdjustmentMinutes` | Probably derived from sleep-cycle length (~45 min at most ages); user can override |
| `putdownLeadMinutes` | Stays (parent preference, not age-dependent) |

The Settings page collapses dramatically. Most rows show a derived
value with a "use family override" toggle. The §F1 accordion +
§F14 settings audit work becomes much smaller (almost moot).

### §2.4 Cascade math shifts: intake-driven, not interval-driven

Today: cascade walks at `intervalForAmount(prev.amountOz)` steps.
Time-driven, with the amount table as a refinement.

v4: cascade walks toward a **daily intake target**. The engine knows:
- Today's target intake (from age band + per-family override)
- What's been recorded so far
- How many feeds typically fit in a day
- Roughly when each upcoming feed should land for even spacing

Practically:

```
target = dailyIntake (from age band)
consumed = sum(recordings.amountOz)
remaining = target - consumed
feedsRemaining = feedsPerDay - recordings.length

per_feed = remaining / feedsRemaining
next_interval = "time-until-next-feed" derived from per_feed via the
  same intervalForAmount logic, OR from age-band typicals
```

The cascade still produces a chain of bottle slots; the math behind
each step is informed by the target intake rather than just a flat
interval. Predict-don't-prescribe still holds — the engine adjusts
predictions as reality lands.

This is the deepest change. It deserves its own scope doc when v4
work starts.

### §2.5 Bedtime emergence is age-aware

Today: bedtime threshold is a configurable time. The engine treats
every nap at/past that time as bedtime.

v4: at very young ages (`!bedtimeEmerged`), there's no distinct
bedtime — it's just another long sleep. The cascade can run through
the night for newborns naturally because the age band's
`overnightFeeds === "expected"` informs whether to project past
the would-be bedtime block.

This subsumes the `projectOvernight` question raised on 2026-05-13:
v4 derives the answer from age. v3 doesn't need the toggle — by the
time it'd matter, v4 should have shipped.

### §2.6 Wake window cascade — same shape

Today: `wakeWindowsMinutes` is a configured array per nap.

v4: derived from age band — N entries at `wakeWindowMinutes.typical`,
with the first wake window typically shorter (also per band; younger
babies tolerate less first-wake time).

Per-family overrides still possible for the outlier-cases (Aden
specifically tolerates 200 min between naps 2 and 3, say).

---

## §3 What stays the same

The v3 architecture continues to work. v4 is a layer ON TOP of v3,
not a replacement.

- **Schema** (mostly) — only `Child.dateOfBirth` added.
- **Lifecycle discriminated union** — unchanged.
- **Rule-registry + topo-sorted evaluator** — unchanged.
- **Predict-don't-prescribe principle** — unchanged.
- **Midnight rule** (day-doc membership by calendar boundary) —
  unchanged.
- **Reality wins** — unchanged.
- **All persistence + Firestore plumbing** — unchanged.
- **Render layer** — mostly unchanged. Some settings rows
  disappear / change to derived-with-override.

The v3 simplification work currently underway (sequential cascades,
fewer rules, cleaner separation) is the RIGHT preparation for v4.
A simpler rule set is easier to refactor onto age-aware defaults.

---

## §4 Why now (write this vision doc)

Three reasons:

1. **Anchor the simplification cycle.** The current v3 simplification
   PRs should NOT cement decisions that v4 would want different.
   Example: the `projectOvernight` boolean from the 2026-05-13
   discussion was a great near-term fix, but v4 derives the same
   answer from age — so we skipped it. The vision doc explains why.

2. **Don't lose the framing.** The intake/age-aware idea is obviously
   right but easy to forget once head-down on render polish, drawer
   bugs, and dashboard tweaks. Capturing it now means it's the
   default-direction when the simplification work stops.

3. **Influence wave 9 and onboarding work.** §F10 (DOB onboarding)
   and §F14 (settings defaults audit) should be scoped with v4 in
   mind. §F10 specifically: ensure DOB is collected even if v3
   doesn't use it yet — then v4 onboarding doesn't need a separate
   migration.

---

## §5 What this is NOT

- Not a spec. Numbers and exact API shapes are sketches.
- Not in scope right now. Don't pick up tasks from this doc.
- Not a rewrite. Schema + lifecycle + persistence + rule architecture
  all stay. v4 is age-aware DEFAULTS, not architectural reset.
- Not a near-term blocker. Jake and Kelly should ship v3 + wave 9,
  use the app, then start v4 when the simplification dust settles.

---

## §6 Signals that v4 work should begin

Don't start v4 until:

- v3 simplification execution plan (`SIMPLIFICATION_SCOPE.md` §8) is
  complete: nap cascade, scheduled-recurring collapse, docs reorg.
- `FAST_FOLLOW.md` backlog is meaningfully drained — items that
  matter for daily use are shipped.
- Frontend-orchestration wave 9 (PWA, E2E, design audit) is done.
- Jake and Kelly have been using the app for at least a few weeks
  daily — usage will reveal where the current `bottlesPerDay`-style
  settings actually feel friction.
- §F10 onboarding ships, capturing DOB in the user record. (Soft
  prerequisite — v4 can't derive without it.)

If we hit those and v4 still doesn't feel needed, that's also a
valid outcome.

---

## §7 Open questions to resolve when v4 starts

1. **Reference tables — single global, or per-baby tunable?**
   Probably per-family overridable but globally sourced from
   `DOMAIN.md` §8 / pediatric research.
2. **How granular should age bands be?** Monthly? The DOMAIN ranges
   are 0-2 / 2-4 / 4-6 / 6-9 / 9-12 months — start there. Pediatric
   norms don't justify finer granularity.
3. **Intake-driven cascade math** — does it actually feel right
   day-to-day, or does it produce surprising recommendations when
   baby has off-pattern days (sickness, growth spurts)? Predict-
   don't-prescribe says the engine should adjust gracefully.
4. **Adolescent / toddler bands** — does v4 stop at 12 months, or
   keep going to 24+? Aden will age out of the 0-12 band eventually.
5. **Twins / multiples** — out of scope for v4 too, but worth
   keeping the data model open to it. Today's "one child per
   account" is fine for now.
6. **Premature babies — adjusted age vs actual age** — small
   addition: `Child.adjustedAge: boolean | duration`. Capture if it
   comes up.

---

## §8 What v4 makes EASIER for the current work

Several open backlog items become much smaller or unnecessary when
v4 lands:

| Backlog item | v3 effort | v4 effort |
|---|---|---|
| §F14 Settings defaults audit | Significant — tune ~10 numeric settings | Trivial — values come from the reference table |
| §F1 Settings page accordion | Real UI work | Much smaller (settings page is smaller) |
| §F3 First-time onboarding | Multi-screen wizard for ~10 fields | One screen: DOB + parent names |
| §F10 Onboarding DOB | Standalone work | Becomes critical-path (already planned, fine) |
| §F11 Settings Save button | Real UI work | Smaller (less to save) |
| `projectOvernight` toggle (skipped 2026-05-13) | Setting + UI + engine plumbing | Doesn't exist — derived from age |

This is the strongest argument for the vision doc: it keeps us from
over-investing in v3 settings UX that v4 deprecates.

---

## §9 Decision log

- 2026-05-13 — Jake: "TBH the better long-term solution here would
  be to have projection be intake-based. Healthy intake amount
  ranges by age, and at some point kinda levels out at 28-32oz. I
  know this starts to dip into needing to add WAY more data points
  and details, but perhaps this is useful in a v4?" → captured as
  vision doc; not in scope for v3 simplification.
- 2026-05-13 — Jake: "We should honestly consider doing something
  similar (projections based on baby developmental research) for
  wake windows + naps." → in scope for v4 (same model applied to
  sleep cascade).
- 2026-05-13 — Jake: "my current goal is to get all the backlog
  items and, eventually, frontend-orchestration wave 9 done so that
  Kelly and I can start using it. Then we can start working on
  adding more advanced features." → ordering confirmed: v3
  simplification + backlog + wave 9 → use the app → THEN v4.
- 2026-05-13 — Skipped `projectOvernight` boolean in favor of v4's
  age-driven derivation. The current bedtime cap suffices for Jake
  and Kelly's 4-month-old use case.
