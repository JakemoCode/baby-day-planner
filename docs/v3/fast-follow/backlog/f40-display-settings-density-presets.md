# §F40 — Display settings: rename + dense/normal/spacious preset

**Source**: Jake, 2026-05-19 (after Daycare/Daily-recurring panels landed).

**Status**: `pending`

**What**:
1. Rename the **"Timeline display"** Settings section → **"Display settings"** (broader scope; future display-related toggles land here).
2. Replace the manual `timelinePxPerHour` number input with a **three-way preset**: dense / normal / spacious.

**Suggested preset mapping** (final values TBD by click-test):

| Preset | px/hour |
|---|---|
| Dense | 80 |
| Normal | 120 *(current default)* |
| Spacious | 180 |

**Design question to settle**: storage shape.

| Option | Trade-off |
|---|---|
| **A — Keep `timelinePxPerHour: number`**, UI maps preset → px on write, snaps to nearest preset on read | Zero schema/engine churn. Defaulter unchanged. UI does the mapping. |
| **B — Add `timelineDensity: "dense" \| "normal" \| "spacious"`**, derive px in render | Cleaner semantic doc. Requires schema migration + defaulter rewrite. Engine read path unchanged (still uses a number derived from the preset). |

**Lean: A.** No reason to change the wire shape for what is purely a UI affordance. The dial just becomes three buttons writing one of three values; reading back snaps to the closest preset.

**Out of scope**:
- Free-form px input as an "Advanced" toggle (defer — solve the common case first).
- Per-page density (dashboard vs timeline). Today it's one setting; keep it global.

**Estimated effort**: ~1 hour. Settings page change + the slugified accordion key rename ("timeline-display" → "display-settings").

---


