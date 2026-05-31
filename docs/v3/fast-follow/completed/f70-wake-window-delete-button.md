# §F70 — wake_window showed a stray Delete button

An auto-promoted (`proj_*`) wake_window fell through `isAutoPromotedSleep`'s
nap/bedtime-only guard and rendered a no-op Delete button. Not a write-path bug
(no doc, no contamination). Fixed by replacing the boolean delete policy with a
3-way `drawerDestructiveAction` that returns `none` for any engine-emitted id.

Shipped in the drawer destructive-action policy change (§F71 PR).
