# Design Audit — 2026-05-20

Worktree: `worktree-design-audit-20260520` (off `origin/main` @ `79f57a9`).
Dev server: http://localhost:3001 (worktree, `.env.local`).
Browser: Claude-in-Chrome, signed-in dogfood session as child "Alala" (5 mo).
Standards: `frontend-orchestration/standards/design-and-a11y.md` — WCAG 2.2 AA, breakpoints 375 / 768 / 1280 / 1440.

Routes audited (signed-in, with active emulator session):
`/`, `/timeline`, `/tomorrow`, `/history`, `/settings`, `/day-templates`. `/sign-in`, `/welcome`, `/invite/[token]` were not visited this pass (would require sign-out from dogfood session).

---

## Summary

| Severity | Count |
|---|---|
| Critical | 4 |
| Major    | 5 active (M3 + M5 retracted as dev-only; M4 reframed as intentional design) |
| Minor    | 7 |

Routes affected: **all signed-in routes** carry the meta-viewport violation; dashboard owns the contrast + redundancy failures; `/history` carries the most visible data/render failure.

Structured violations (one per row, severity | criterion / source | route | selector | description):

| Sev | Crit / Src | Route | Selector | Description |
|---|---|---|---|---|
| Critical | WCAG 1.4.4 | all | `meta[name="viewport"][content*="maximum-scale=1"]` (`src/app/layout.tsx:13`) | `maximumScale: 1` blocks user zoom. Violates 1.4.4 Resize Text. |
| Critical | render bug | `/history` | `[data-testid="history-list"] > li × 3` | "Last 7 days" lists three rows all titled "Wed, May 20" — same date repeats. Either key collision, missing dedup, or seed data anomaly leaking through. |
| Critical | composition | `/`, `/settings`, `/history`, `/tomorrow`, `/day-templates` | `body > main` | App is mobile-first with a fixed-width center column (~470 px) at all breakpoints. At 1280 + 1440 px, **40–60% of the viewport is empty side-margin**. Desktop users get the mobile experience with chrome around it. |
| Critical | composition redundancy | `/` | `.NextEventPanel + .NextBottlePanel` | "NEXT EVENT" and "NEXT BOTTLE" cards stack vertically showing the **same time (4:10 PM)** with near-identical typography. Whenever the next event IS the next bottle/nap (the common case), the NEXT EVENT card is pure duplicate ink. |
| Major | WCAG 1.4.3 | `/` | `.ActionButton-module__button` (primary `Start Bottle Now`, `Start Nap Now`, `Start New Day`) | White text `#ffffff` on sage `--color-accent #7d9a7a` → **3.09:1**. Fails AA 4.5:1 for body text; passes only large-text 3:1. Per `src/v3/components/Dashboard/ActionButton.module.css:7-8`. |
| Major | WCAG 1.4.3 | `/` | `.NowBanner-module__muted` | "ends 4:42 PM" caption `--color-muted #7a716a` on `--color-accent-soft #c1cfbc` → **2.93:1**. `src/v3/components/Dashboard/NowBanner.module.css:24-25`. |
| ~~Major~~ | ~~composition~~ | — | ~~`.actionsRow`~~ | **RETRACTED 2026-05-20** — "Start New Day" is dev-only. Prod renders the symmetric 2-CTA row (`Start Bottle Now` + `Start Nap Now`). False positive. |
| Acknowledged | composition / nav | all | bottom nav `<nav>` | Bottom nav intentionally surfaces the 3 daily-use destinations (Dashboard / Timeline / Tomorrow). Settings, History, Day templates, Sign out live in the sticky-header kebab. **Per Jake 2026-05-20: this is intentional**, not a discoverability bug — Settings is configure-once-then-rarely-touch; History + Day templates are browse-mode. Future audits should not re-flag this. |
| ~~Major~~ | ~~composition~~ | — | ~~floating `.avatar`~~ | **RETRACTED 2026-05-20** — the "N" pill bottom-left is the Next.js dev-mode build indicator, not an app element. Not in prod. False positive. |
| Major | composition | `/tomorrow`, `/day-templates` | `.TimelineView` | Timeline preview renders **5A and 6A empty hours** above the first event (7A wake). User has to scroll past 2 hours of nothing to reach the day. Should clip to first/last event ± padding. |
| Major | header consistency | `/settings`, `/history`, `/day-templates`, `/tomorrow` | global `<header>` | Header still shows "Wed, May 20" day-context on routes that have nothing to do with today (settings is global; tomorrow is the *next* day; history is the *past*). Misleading. |
| Major | placeholder data | all | `<header>` "Alala, 5 years" | Dogfood data shows baby's age as "5 years" — UI built for months. Long-name + age combos at mobile risk header overflow. Cosmetic for Jake but flagged because it reveals an age-format edge case the formatter doesn't handle. |
| Minor | visual polish | `/settings` | `<summary>` triangles | Collapse/expand uses raw `▶` / `▼` Unicode glyphs. Looks like a 90s file explorer next to the otherwise polished sage palette. Swap for an inline SVG chevron. |
| Minor | empty state | `/history` | (whole route) | "Last 7 days" with no help text; no "view more", no calendar entry-point, no "no history yet" empty state. |
| Minor | empty state | `/day-templates` | `<button>` Sunday | Saturday/Sunday tabs render but their schedules look identical to weekday — no visible delta. If templates can't yet differ from defaults, render an empty-state explaining what configuring them will do. |
| Minor | landmark | all | layout `<body>` | No explicit `<main>` landmark wrapping route content (children render directly inside body via AuthProvider). axe didn't flag in this run but assistive tech wayfinding would benefit. |
| Minor | motion | all | `.disclosure`, drawer transitions | Have not yet validated `prefers-reduced-motion` handling on the drawer slide + putdown-chip fade. Should be checked against the standard. |
| Minor | typography | `/`, `/timeline` | `.NextEventPanel time`, `.NowBanner` | `4:10 PM` and `4:42 PM` numerals use the same accent green as CTAs. Time-as-data and time-as-CTA share visual weight, weakening hierarchy. |
| Minor | consistency | `/`, `/timeline` | bottom nav active state | Active route indicator (`Dashboard` underline) is subtle; relies on text color shift alone. Below the 3:1 non-text UI threshold relative to inactive labels. |

---

## Critical (fix before merge)

### C1 — viewport disables user zoom (WCAG 1.4.4)
- **File:** `src/app/layout.tsx:10-15`
- **Fix:** Remove `maximumScale: 1`. Allow user-initiated zoom; iOS double-tap prevention should come from `touch-action: manipulation` in CSS, not from blocking accessibility.

### C2 — `/history` shows three identical "Wed, May 20" rows
- **File:** `src/app/(signed-in-with-child)/history/page.tsx` (+ formatter)
- **Investigation needed before fix.** Possibilities:
  - All three docs are the same `dayId` (key collision) → dedup by `dayId`
  - All three are distinct `dayId` but identical `localDate` field (seed bug) → render the actual local date per row
  - List sort/range query returns repeats — check the repository query

### C3 — Center-column lock at all breakpoints (composition)
- **Files:** `src/app/(signed-in-with-child)/*/page.tsx` containers + likely a `max-width` in layout CSS
- **Fix scope (incremental):** introduce desktop-aware breakpoint that either (a) widens cards to fill 60–70% of viewport with comfortable max, or (b) introduces a side rail at ≥1024 px so desktop users get *more* information density instead of *more empty space*. This is the most visible failure of the audit.

### C4 — NEXT EVENT and NEXT BOTTLE redundancy on dashboard
- **Files:** `src/v3/components/Dashboard/NextEventPanel.tsx`, `NextBottlePanel.tsx`
- **Fix:** suppress NEXT EVENT when the next event IS the next bottle or nap (the type-specific panel already covers it). NEXT EVENT should only appear when it's something *else* (daycare, extra, dream feed) — i.e., it earns its row only when it adds information.

---

## Major (fix in same sprint)

### M1 + M2 — CTA + caption contrast (WCAG 1.4.3)
- `src/v3/components/Dashboard/ActionButton.module.css:7-8` — primary button white-on-`#7d9a7a` is **3.09:1**. Darken `--color-accent` (or use `--color-fg` for text on accent) to reach 4.5:1.
- `src/v3/components/Dashboard/NowBanner.module.css:24-25` — `.muted` on accent-soft pill is **2.93:1**. Use `--color-fg-soft` (`#4a4138`) inside the pill instead of `--color-muted`.

### ~~M3 — CTA grid asymmetry~~ (RETRACTED — "Start New Day" is dev-only; prod renders the symmetric 2-CTA row.)

### M4 — Bottom nav coverage (ACKNOWLEDGED — intentional design, not a bug)
- Per Jake 2026-05-20: the 3-tab nav (Dashboard / Timeline / Tomorrow) intentionally surfaces only the **daily-use** destinations. Settings, History, and Day templates live in the sticky-header kebab because:
  - **Settings** is configure-once-then-rarely-touched
  - **History** is browse-mode, not a daily destination
  - **Day templates** is configuration
- A 4th nav item dilutes the daily-use signal without earning its real estate. Future audits should not re-flag this.

### ~~M5 — Three competing bottom affordances~~ (RETRACTED — the "N" pill is the Next.js dev build indicator, not an app element.)

### M6 — Tomorrow + day-templates render empty 5A / 6A hours
- `src/v3/components/Timeline/TimelineView.tsx` (or equivalent) — clip viewport to `firstEvent.startTime - 30min` and `lastEvent.endTime + 30min`. Do NOT render fixed 5A baseline if no event lives there.

### M7 — Day-context header on non-day routes
- Global `<header>` shows "Wed, May 20" on `/settings`, `/history`, `/day-templates`, `/tomorrow`. Either (a) hide the date on these routes, or (b) replace it with the route title (Settings, History, Templates, Tomorrow).

### M8 — Age formatter renders "5 years" for a 5-month-old (cosmetic but reveals bug)
- Age formatter likely doing `${ageInMonths >= 12 ? years : months}` with months as units everywhere except this surface. Audit the formatter.

---

## Minor (fix when touching the component)

- N1 — Replace `▶`/`▼` glyphs on Settings disclosure with SVG chevron (`/settings`).
- N2 — Empty/extended states for `/history` and `/day-templates`.
- N3 — Add `<main role="main">` landmark in `(signed-in-with-child)/layout.tsx`.
- N4 — Verify `prefers-reduced-motion` honored on drawer transitions + putdown-chip fades.
- N5 — Differentiate time-as-data vs time-as-CTA typography on dashboard.
- N6 — Bottom-nav active state needs visual indicator beyond color (underline weight, icon fill).
- N7 — `/timeline` opens scrolled to current time but Wake window 4 is half-clipped at top; nudge the auto-scroll offset.

---

## Acknowledged Issues (user-approved to ship)

- **M4 — Bottom nav stays at 3 items (Dashboard / Timeline / Tomorrow)**
  Acknowledged: 2026-05-20
  Reason: "Settings should be updated infrequently once set up whereas the three items on the tabbar will likely be used the most." Kebab pattern in the sticky header is the intentional home for less-frequent destinations (Settings, History, Day templates, Sign out).
  Tracked: PR #206 explored promoting Settings to a 4th tab; closed unmerged after weighing the duplication tax (Settings reachable via two paths) against the marginal discoverability win.

---

## Screenshots

Captured in-session via Claude-in-Chrome `computer:screenshot save_to_disk=true`. IDs preserved in tool log; not exported to a baseline directory this pass. Breakdown:

| Route | Mobile (375) | Tablet (768) | Desktop (1280) | Lg-Desktop (1440) |
|---|---|---|---|---|
| `/` | ss_19357w59t | ss_20154f5g3 | ss_2615x3nfz | ss_2106ajf6q |
| `/timeline` | ss_4624ymbm9 | — | ss_4537j524n | — |
| `/settings` | ss_5015uqlvf | — | ss_49270keac | — |
| `/history` | ss_6026oulll | — | ss_5948v3911 | — |
| `/tomorrow` | — | — | ss_9529bi2mj | — |
| `/day-templates` | — | — | ss_0187csy0s | — |

To promote these to visual-regression baseline, re-run `/set-baseline` against this branch.

---

## Passes

- Color palette is cohesive (sage/cream warm-earth) — no accidental Tailwind defaults
- CSS Modules + token discipline holding — no hardcoded font sizes / colors leaking into inline styles
- Mobile layout is genuinely good — the cards and bottom-nav read cleanly at 375 px
- Settings disclosure structure with `<details>`/`<summary>` is semantically right (even if visually plain)
- Top header `aria-current` link semantics are correct (axe didn't flag landmark issues)
- Timeline chip layering / putdown chips render without overlap collisions

---

## Phase 3 — Auto-fixes applied (2026-05-20)

| ID | Status | Change |
|---|---|---|
| C1 | ✅ fixed | Removed `maximumScale: 1` from `src/app/layout.tsx:13`. User zoom restored; passes WCAG 1.4.4. |
| M1 | ✅ fixed | `ActionButton.module.css` primary `color: var(--color-surface)` → `var(--color-fg)`. Dark text on sage clears 4.5:1. |
| M2 | ✅ fixed | `NowBanner.module.css` `.muted` `color: var(--color-muted)` → `var(--color-fg-soft)`. Pill subtitle now clears AA on accent-soft. |

**Re-scan result:** axe contrast violations dropped 5 → 1. Viewport violation cleared. Unit suite 682/682 green.

**New finding surfaced by the re-scan** (was masked before by the louder failures):

| Sev | Crit | Route | Selector | Description |
|---|---|---|---|---|
| Major (was N6) | WCAG 1.4.3 | all | `a[aria-current="page"] > span:nth-child(2)` (bottom-nav active label) | Active-route label uses `--color-accent #7d9a7a` on white at 12 px → **3.09:1**. Promoted from Minor N6. Fix options: use `--color-fg` for the label and indicate active state via underline/icon-fill, OR introduce `--color-accent-strong` token darker than 4.5:1 for active-state semantics. **Not auto-fixed — affects nav design.** |

### Deferred (need product/design judgement)

- **C2** — `/history` data/render bug requires understanding intent (dedup vs distinct render)
- **C3** — Desktop layout direction is a product decision (wider cards vs side rail vs both)
- **C4** — Suppressing NEXT EVENT changes information architecture
- **M3 – M8** — All require product/design judgement
