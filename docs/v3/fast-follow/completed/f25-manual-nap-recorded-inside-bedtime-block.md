# §F25 — Manual nap recorded inside bedtime block claims `nap_1` eventKey


Shipped in **PR #143** (commit `d15731f`) alongside §F22/§F24 — the
save-path now scans existing naps for the next free `nap_N` slot
before assigning, so an in-bedtime manual nap no longer collides
with the day's actual `nap_1`.
