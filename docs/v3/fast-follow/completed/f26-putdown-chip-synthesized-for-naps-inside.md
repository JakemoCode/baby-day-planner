# §F26 — Putdown chip synthesized for naps inside the bedtime block


Structurally closed by current `putdown.ts` lifecycle gate. The rule
only sets `hasPutdown=true` for `{projected, overridden}` lifecycles
— a manually-recorded nap is `started` or `completed`, so the
synthetic chip can no longer be emitted. No standalone fix needed.
