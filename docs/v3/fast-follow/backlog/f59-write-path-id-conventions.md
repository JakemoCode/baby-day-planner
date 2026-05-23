# §F59 — Unify write-path id conventions for slot-keyed events + orphan cleanup

**Source**: Jake, 2026-05-22 (chat: "drawer bug"). Follow-up to PR #232.

**Status**: `in-progress`

**What**: Three writers use inconsistent Firestore doc-id conventions for the same logical slot:

| Caller | Doc id written | `eventKey` |
|---|---|---|
| `NapActionButton.tsx:132` (Start Nap Now) | `nap_N` | `nap_N` |
| `NapActionButton.tsx:103` (Start Bedtime Now) | `bedtime` | `bedtime` |
| `EventEditDrawerV3.tsx:248` (Change-to-bedtime confirm) | `bedtime` | `bedtime` |
| `useDrawer.ts:81` (drawer edits on projected events, per PR #186) | `recorded_${eventKey}` | `<eventKey>` |

If a user drawer-edits projected Nap N then taps "Start Nap Now" on that slot, Firestore ends up with two docs (`nap_N` + `recorded_nap_N`), both `eventKey: nap_N`. PR #232 hides the second one at the render layer; this fast-follow eliminates the orphan write at the source.

**Direction: Option A** — `NapActionButton` and `EventEditDrawerV3` adopt `recorded_${eventKey}` to match the drawer + daycare's existing convention. Fewer breaking changes for existing data than flipping the drawer to bare-eventKey.

**Also**: one-time read-side migration that detects duplicate `(type, eventKey)` doc pairs and deletes the loser (PR #232's policy: most-recent annotation wins, stable id tie-break). After this lands, the render dedup in `renderProjection.ts` becomes a defensive net rather than the primary fix.

**Why fast-follow**: PR #232 closes the user-visible symptom; the root cause is real but not urgent now that the symptom is gone.

**Estimated effort**: ~2–3 hr (single PR for convention + migration).

**Acceptance**:
- `grep -rn "id: \"nap_\|id: \"bedtime\"\|id: mode.projected.eventKey" src/` returns zero matches in production code.
- New integration test: drawer-edit followed by Start-Nap-Now produces exactly one Firestore doc.
- One-time migration deletes orphan loser docs on day load.

---


