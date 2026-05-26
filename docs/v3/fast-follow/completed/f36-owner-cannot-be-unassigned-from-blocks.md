# §F36 — Owner cannot be unassigned from blocks or instant chips


Shipped in **PR #186** (commit `e63dc67`). `Event.owner` is now required with `NO_OWNER = { slot: "none" }` as the absence value; OwnerPickerV3 surfaces a "None" option. Schema invariant locked via seam test.
