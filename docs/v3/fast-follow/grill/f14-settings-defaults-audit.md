# §F14 — Settings defaults audit + Settings UX pass

**Source**: Jake click-test feedback, 2026-05-11.

**Status**: `pending`

### Numeric defaults (current → proposed)
- `defaultNapLengthMinutes`: 90 → **45** (one sleep cycle covers most newborns/infants)
- `bedtimeThreshold`: 19:00 → **17:30** (1050 TimeMin)
- `shortNapThresholdMinutes`: 45 → **30**
- `shortNapAdjustmentMinutes`: 30 → **10**
- `napDurationMin`: 30 → **20**
- `defaultBottleIntervalMinutes`: 180 → **150**
- `wakeWindowsMinutes`: `[120, 150, 180, 180, 180, 180]` → **TBD**. Current values aren't grounded in the PRD. Wake-window length is baby-age-dependent; suggest parameterizing via §F10 onboarding (age-based suggestions). Until then, replace with shorter newborn-friendly values, or annotate `// FIXME(§F10)`.

### Settings UI labels + helper text
- `shortNapThresholdMinutes` — add helper text explaining the rule
- `shortNapAdjustmentMinutes` — add helper text
- `bottleChain.bufferAfterWakeMinutes` — rename label to **"default time from wake to first bottle"**
- Duration fields render as raw minutes; should display as HH:MM (overlaps §F6)

### Missing dailyRecurring / extras editor
Jake noted "I don't see extra recurring events in settings? where'd that go?" — `Settings.dailyRecurring[]` exists in the schema but the V3 Settings page doesn't expose it. Investigate; restore the editor (or add to §F1 accordion when it lands).

---


