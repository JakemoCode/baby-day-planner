# §F27 — Delete button on Extra event drawer

Resolved by the §F70/§F71 `drawerDestructiveAction` work (**PR #287**): the
drawer shows a destructive action for recorded extras (Delete) and recurring
events (Skip today / Delete), wired through `onDelete` on every page. Confirmed
by click-test 2026-06-01.
