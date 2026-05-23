# §F45 — /history/[date] detail header: bottle count + total oz + nap count

**Source**: Jake, 2026-05-21 — clicking into a history day shows just the timeline, no roll-up stats.

**Status**: `pending`

**What**: render a small summary row at the top of `/history/[date]` showing the day's totals — e.g. `3 bottles · 18 oz · 4 naps · 4h 30m sleep`. Same shape as the existing `HistoryDayCard` summary (`HistoryDayCardSummary`) but at the page header. Optional: surface percentile/target deltas vs settings defaults.

**Why fast-follow**: pure render layer; no engine work. Settings already carry the daily targets that would let us color a "X over/under target" indicator if we want.

**Estimated effort**: ~half evening. Component already exists for the list-card variant; just thread the data + style at the page-header position.

---


