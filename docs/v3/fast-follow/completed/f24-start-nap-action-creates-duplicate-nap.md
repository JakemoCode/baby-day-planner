# §F24 — Start Nap action creates duplicate nap instead of promoting projection


Shipped in **PR #143** (commit `d15731f`). NapActionButton now
promotes the next-projected nap's `eventKey` instead of inventing a
new `nap_${nextNumber}` slot, eliminating the side-by-side duplicate.
PR #143 follow-up (commit `4231f39`) added UUID `eventKey` for
off-pattern naps so they don't masquerade as cascade slots.
