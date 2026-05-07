# Handoff: Baby Schedule Timeline (V1 Inline-Gutter)

## Overview

A vertically-oriented, mobile-first timeline that forecasts a baby's day. The timeline displays:

- **Block events** (have duration) — Wake windows, Naps, Putdown, and user-created Custom events.
- **Instant events** (effectively no duration) — Bottles, Pumping, Bedtime, "Cook dinner," etc.
- An **absolute time axis** with hourly marks down the left.
- A **live "now" bar** that pins the current time.

The chosen direction is **V1 — Inline Gutter**: a single-column timeline where blocks fill most of the width and instant events live in a fixed-width right gutter, pinned to their exact time and tied to the timeline by a leader line.

## About the Design Files

The files in this bundle are **design references created in HTML** — wireframe prototypes showing intended layout and behavior. They are **not** production code to copy directly. The task is to **recreate this design in your app's existing environment** (the codebase you're building in Claude Code) using its established patterns, components, and styling system. If no styling system exists yet, choose the most appropriate framework for the project and implement there.

The HTML prototype uses inline JSX-in-Babel and a sketchy hand-drawn aesthetic intentionally — those are wireframe choices, not production guidance. **Re-render the same layout and rules in your real design system / component library.**

## Fidelity

**Low-fidelity (lofi)** — these are wireframes. Treat them as authoritative for:

- Spatial structure and column widths
- Z-order and which element wins when things overlap
- Rules about what may not occlude what
- Information density and where each piece of data belongs

Treat them as **non-authoritative** for:

- Exact colors (the sketchy palette is a wireframe convention; use your app's tokens)
- Typography (use your app's fonts)
- Borders, shadows, corner radii (substitute your design system's equivalents)

## The Single Screen: Day Timeline

### Layout (top → bottom, left → right)

A scrollable vertical column. Three implicit lanes:

| Lane | Width | Contents |
|---|---|---|
| **Axis** (left) | ~50px | Hour labels (e.g. "8 AM"), the "now" pill |
| **Block lane** (center) | flex / fills remaining | Wake / Nap / Putdown / Custom blocks |
| **Instant gutter** (right) | ~110px | Instant-event chips |

The vertical y-coordinate is `(minutes_since_day_start) * px_per_minute`. `px_per_minute` is configurable (the prototype exposes 70–220 px/hour); pick a reasonable default like **120 px/hour** (so 1 minute = 2 px).

### Hour grid

- A horizontal dashed line at every hour mark, spanning from the right edge of the axis lane to the right edge of the screen.
- The hour label sits in the axis lane, right-aligned, vertically centered on the line.
- Format: lowercase short, uppercased — e.g. "8 AM", "12 PM", "1 PM".

### Block events

A block represents a duration. It sits at `top = y(start)`, `height = y(end) - y(start)`.

- **Wake Window**: full width of the block lane.
- **Nap**: full width of the block lane.
- **Putdown**: This is the LAST 15 minutes of a wake window. Renders **anchored to the LEFT edge of the block lane**, but **narrower** — it stops short of the right side of the block lane so it does not occlude the wake-window text. Visually distinguished with a diagonal-stripe pattern. Sits on top of the wake window (z-index above wake).
- **Custom block** (e.g. "Friend visit", "Out to dinner"): Renders **anchored to the RIGHT edge of the block lane** as a sub-block, leaving the wake-window's name and time visible on the left. Custom block also draws **thin (1px) horizontal start/end marker lines** that extend slightly past its left and right edges to make its start and end times visually clear.

#### Block content (in this order, top-aligned, padded ~3px 6px)

1. **Label** — bold, larger ("Caveat 14px" in the wireframe; substitute your display font).
2. **Time range** — small, muted: `<startShort>–<endShort>` (e.g. "9:10a–10:45a").
3. **Owner** (if set) — small dot or text in the owner's color, e.g. `· Mom`.

#### Block visual encoding

The user's chosen color strategy is **type = fill, owner = dot/border**:

- **Fill color** = event type (wake / nap / putdown / custom each have a distinct fill).
- **Left border** = owner's color (a 5px-thick colored stripe on the left edge), if the event has an owner.
- A **toggle** is exposed in the prototype to swap to "Owner colors the fill" instead — if you support a setting for this, swapping the meanings of fill and stripe is the implementation.

### Instant events (right gutter)

Each instant event renders as a **chip** containing:

- A colored **dot** on the left (event type's color).
- The **type name** in bold (e.g. "Pump", "Bottle").
- The **time** in muted text (e.g. "10:00a").

The chip cluster is positioned with its top at `y(at) - 10` so the chip's vertical center aligns with the event's actual time.

A **leader line** (1.5px solid, neutral grey) extends from the right edge of the block lane to the leftmost chip — this ties the chip cluster to its true time on the axis.

#### Concurrency rule (CRITICAL)

If multiple instant events occur at the **exact same time**, they must **fan horizontally** within the gutter at the same y-coordinate. They **must not stack vertically**, because vertical stacking would falsely imply they happen at different times.

If horizontal space runs out, wrap to a second row immediately below — but events at the *same* time stay on adjacent x-positions, never on different y-positions corresponding to different times.

The prototype groups instants by their `at` timestamp into a `groups` array, then renders one container per group with `flex-direction: row; flex-wrap: wrap; justify-content: flex-start`.

### "Now" bar

- A 2px solid red horizontal line spanning the block lane and instant gutter.
- A red **time pill** sits in the **axis lane** (left of the line) showing the current time (e.g. "9:03 AM"). The pill is **constrained to the axis lane width** so it cannot occlude any event content.
- Updates live (re-render every minute, or on `setInterval`).

### Past vs. future

A toggle `dimPast` controls whether events that have already ended (or instants whose time has passed) render at 0.45 opacity. Default ON.

## Interactions & Behavior

The wireframes are static layout. For your app, expected interactions include:

- **Tap a block** → open detail / edit sheet.
- **Tap an instant chip** → open detail / edit sheet.
- **Long-press a block** → drag to reschedule (optional).
- The timeline is **scrollable vertically**; on mount, scroll to the "now" bar with a small offset so it appears in the upper portion of the visible area.
- Live updates: the "now" bar moves continuously (or on a 1-minute tick); events that pass NOW transition to the dimmed state.

## Rules & Domain Logic (recap from the user's prompt)

- Wake windows are user-configurable per index (length of WW1, WW2, etc.).
- Bottle interval is governed by the size of the prior bottle (lookup table / function).
- Pumping schedule is its own setting.
- Default nap length is configurable; if a forecasted nap would start **after** the bedtime threshold, that nap is replaced by a single Bedtime instant.
- "No bottles in the middle of naps" — the scheduler must shift bottles outside nap blocks.
- Putdown = last 15 minutes of the wake window (overlaps wake, never nap).
- Cook dinner = an instant at a user-configured time.

These are **scheduler** rules, not rendering rules — they produce the array of events that the timeline simply lays out.

## Data Model

The prototype's event shape (use this as a starting point for your types):

```ts
type Owner = 'mom' | 'dad' | 'nana' | string;

type EventType =
  | 'wake' | 'nap' | 'putdown' | 'custom'   // block
  | 'bottle' | 'pump' | 'bedtime' | 'cook'; // instant

type BlockEvent = {
  kind: 'block';
  type: 'wake' | 'nap' | 'putdown' | 'custom';
  start: number;   // minutes since midnight
  end: number;     // minutes since midnight
  label: string;
  owner?: Owner;
};

type InstantEvent = {
  kind: 'instant';
  type: 'bottle' | 'pump' | 'bedtime' | 'cook' | 'custom';
  at: number;      // minutes since midnight
  label: string;
  owner?: Owner;
};

type ScheduleEvent = BlockEvent | InstantEvent;
```

A helper to group concurrent instants:

```ts
function groupInstants(events: ScheduleEvent[]) {
  const map = new Map<number, InstantEvent[]>();
  for (const e of events) {
    if (e.kind !== 'instant') continue;
    if (!map.has(e.at)) map.set(e.at, []);
    map.get(e.at)!.push(e);
  }
  return [...map.entries()]
    .map(([at, items]) => ({ at, items }))
    .sort((a, b) => a.at - b.at);
}
```

## Design Tokens (suggested mappings)

The prototype uses a sketchy warm-cream palette. **Replace with your app's tokens**, but here are the *roles* you need:

| Role | Wireframe value | Your app should use |
|---|---|---|
| Page background | `#f5efe1` | App background |
| Block lane background | (transparent) | (transparent) |
| Hour label | `#5a5040` | Muted/secondary text |
| Hour grid line | `#c8bea8` dashed 1px | Subtle divider |
| Wake fill | `#fbeec8` | Type-1 fill |
| Wake stroke | `#b89a4a` | Type-1 border |
| Nap fill | `#cfd9c5` | Type-2 fill |
| Nap stroke | `#6f8560` | Type-2 border |
| Putdown stripes | `#e8dcc0` / `#f3e8c8` | Type-3 stripes |
| Putdown stroke | `#a08658` | Type-3 border |
| Custom fill | (none — same as wake area) | Type-4 outline-only or subtle fill |
| Custom marker line | event type color (1px) | 1px line |
| Bottle dot | `#7c9bbd` | Distinct dot color |
| Pump dot | `#a37ab8` | Distinct dot color |
| Bedtime dot | `#3a3a55` | Distinct dot color |
| Cook dot | `#d18a4a` | Distinct dot color |
| Owner: Mom | `#c4626b` | Avatar color 1 |
| Owner: Dad | `#5b7fa8` | Avatar color 2 |
| Owner: Nana | `#9d7eb8` | Avatar color 3 |
| Now line | `#d04a3a` 2px | Accent / danger |
| Owner stripe (block left edge) | 5px solid owner.color | 4–5px |
| Block radius | 4px | Your card radius |
| Chip radius | 10px (pill) | Your pill radius |

## Spacing constants (V1 specifically)

| Token | Value |
|---|---|
| `AXIS_W` | 50px |
| `GUTTER_W` | 110px |
| Block padding | 3px top/bottom, 6px left/right |
| Block lane left edge | `AXIS_W + 4` |
| Block lane right edge | `viewport - GUTTER_W` |
| Putdown right inset | `GUTTER_W + 30` (pulls it ~30px in from the wake's right edge) |
| Custom block left inset | `AXIS_W + 4 + 110` (sub-block anchored to right of block lane) |
| Owner left stripe | 5px |
| Default hour height | 120px (= 2 px / minute) |

## Tweaks (settings users can change)

The prototype exposes these — your app's settings screen should cover them:

- **Color encodes** — Type fill / Owner fill (boolean swap).
- **Dim past events** — bool, default true.
- **Hour height** — slider, 70–220 px, default 120.
- **Dataset** — busy vs. simple is a wireframe-only toggle for demo data; remove in production.

## Z-Order

From back to front:

1. Hour grid lines
2. Wake / Nap / generic blocks
3. Putdown (above wake, but visually narrower)
4. Custom block (above wake, anchored right)
5. Instant chip cluster + leader line
6. Now line + now pill (always on top)

## Anti-Requirements (must not happen)

- An instant chip must **never** sit on top of block text.
- Two concurrent instants must **never** stack vertically.
- The "Now" pill must **never** cover an event label or time.
- A Putdown's stripes must **never** cover the parent wake window's name or time text.
- A Custom block must have visually clear start and end (the 1px marker lines provide this).

## Files in this Handoff

- `Baby Schedule Wireframes.html` — the master HTML that mounts everything via Babel + React.
- `data.jsx` — sample event data + helpers (`fmt`, `fmtShort`, `groupInstants`, `OWNERS`, `TYPES`, `BUSY_DAY`, `SIMPLE_DAY`, `NOW_MIN`).
- `phone.jsx` — purely presentational mobile frame for the wireframe; ignore in production.
- `v1-gutter.jsx` — **the V1 design** you are recreating. This is the file to study closely.
- `v2-twocol.jsx`, `v3-tick.jsx` — alternate explorations the user did not select. Not for implementation; included only for reference if questions arise about why V1 was chosen.
- `tweaks-panel.jsx`, `design-canvas.jsx` — wireframe tooling, not part of the design.

## Implementation Notes for Claude Code

- **Don't port the JSX inline-style approach**; translate to your app's styling system (Tailwind, CSS modules, styled-components, SwiftUI views, etc.).
- The layout is dead simple: **one absolutely-positioned container per event**, positioned by `top` (start time) and `height` (duration) for blocks, or `top` (at time) for instants. Group instants first, then render one positioned cluster per group.
- The "now" bar can be its own absolutely-positioned overlay; don't rebuild the whole list every tick — just move the now-bar element.
- For accessibility: each event should be a focusable element with an `aria-label` like `"Nap 1, 8:25 AM to 9:10 AM"`; the timeline as a whole should be a labeled region.
- For mobile touch targets: ensure each chip and block is at least 44×44 logical px tappable.
