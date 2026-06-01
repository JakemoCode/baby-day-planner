# §F69 — useDrawer: convert positional params to an options object

Shipped in **PR #285**. `useDrawer` now takes a single options object instead
of six positional params, so call sites read by name and new optional deps
don't churn every site.
