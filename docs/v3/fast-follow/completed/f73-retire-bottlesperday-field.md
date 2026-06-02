# §F73 — Retire the `bottlesPerDay` field

Shipped in **PR #305**. Removed the dead `bottleChain.bottlesPerDay` setting —
vestigial after the §F66 rewrite (#303) replaced count-based bottle projection
with a time-cap fill. Dropped from the schema, defaults, settings UI, and ~80
test fixtures; rewrote ENGINE_SPEC R5.11 and the DATA_MODEL/ARCHITECTURE_V3
schema docs. No runtime behavior change (no engine code read the field).

(Was briefly mis-filed as §F70 in #304 — a number already used by the wake_window
delete-button item; renumbered to §F73.)
