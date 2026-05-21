# Auth → Onboarding → Dashboard collapse

Blueprint for retiring the route-group split that triggered two multi-hour debugging sessions (2026-05-19 and 2026-05-21). Step-back rule fired on the patch chain: `window.location.href` → `everReadyRef` → `getDocFromServer` → rules workarounds.

This doc is the spec. Update the doc, not the code, if implementation reveals scope drift.

> **Status — do not start PR A until §1 experiments resolve:**
> - **Exp 1 fails** (SDK re-init isn't the trigger): re-scope. PR A as written won't fix the bug.
> - **Exp 1 passes, Exp 2 fails** (subscription echo doesn't work): PR A proceeds, but §3 "Onboarding submit" swaps to explicit refetch instead of subscription echo.
> - **Exp 1 passes, Exp 2 passes, Exp 3 passes** (Next.js 16 supports the layout pattern): PR A as scoped.
> - **Exp 3 fails**: re-scope around middleware-based auth gating.

---

## §1 Falsifying experiments (mandatory before PR A opens)

**Hypothesized cause:** `window.location.href = "/"` after `batch.commit()` triggers a fresh SDK init, which fires watch listeners on docs the emulator's rules-eval hasn't propagated yet.

**Alternative not yet ruled out:** the `useV3Child(firstChildId)` hook mounts a fresh `onSnapshot` against the just-written child doc in the same microtask as `useV3User`'s first snapshot — and rules-eval races *watch-attach*, not SDK re-init. If true, PR A still triggers the bug.

### Exp 1 — does removing the reload fix it? (~15 min)
1. **Comment out `everReadyRef` in `(signed-in-with-child)/layout.tsx:37-49`.** The latch was added explicitly to mask this race class; leaving it active gives a false positive. Exp 1 only "passes" if it passes WITHOUT the latch.
2. Replace `window.location.href = "/"` with `router.replace("/")` in `welcome/page.tsx` submit.
3. Bounce emulator, wipe IDB, hard refresh, run onboarding.
4. **Pass** = error gone → PR A justified.
5. **Fail** = error persists → re-scope; the bug is in subscription attach timing, not architecture.

Result: _<pending>_

### Exp 2 — does the existing subscription echo local writes? (~30–90 min)
First check whether `tests/integration/` has component-mount-against-emulator harness. If not, **building the harness is part of this experiment** (RulesTestEnvironment gives authed `Firestore` instances; mounting React components against the live `firebaseApp` is separate infra).

Then: mount a component that subscribes to `users/{uid}` via `useV3User`, run the 4-doc onboarding writeBatch, assert the subscription emits `childIds: [newId]` within 500ms with zero `permission-denied` logs.

**Pass** = §3 "Onboarding submit" pattern works.
**Fail** = re-scope §3 to use an explicit refetch trigger after `batch.commit()`.

Result: _<pending>_

### Exp 3 — does Next.js 16 support the proposed layout pattern? (~15 min)
Verify via Context7 (`mcp__plugin_context7_context7__*`) that a top-level `"use client"` layout with conditional render branches (SignIn vs Welcome vs Dashboard) is the recommended auth-gating pattern in Next.js 16 App Router. If the official guidance is "use middleware for auth," re-scope.

Result: _<pending>_

---

## §2 The model error (one-screen summary)

We modeled "has child" vs "no child" as a routing decision (Next.js route groups). It's a render-time data condition. Forcing routing made every transition a navigation, which compounded:

- `router.replace` doesn't tear down the SDK → race conditions → `everReadyRef` latch
- `everReadyRef` doesn't survive navigation → `window.location.href` (reload)
- Reload re-inits the SDK → fresh listens race rules propagation
- Denials cascade INTERNAL ASSERTION FAILED → unrecoverable

---

## §3 Target architecture

```
src/app/
├── layout.tsx                          # AuthProvider only (unchanged)
├── invite/[token]/page.tsx             # Unchanged (mechanism: §5)
└── (signed-in)/                        # Single layout
    ├── layout.tsx                      # Switches on resolution union
    ├── _welcome/Welcome.tsx            # Component, NOT a route
    ├── page.tsx                        # Dashboard
    └── timeline/, tomorrow/, history/, settings/, day-templates/
```

**Decided hook shape:** expand the hook's union to include all auth states, AND rename `useChildResolution` → `useSessionResolution` while we're already touching every call site. Current name promises "resolves a child" but the implementation now resolves the full session state; the rename eliminates a naming-vs-behavior mismatch for free during PR A (search-and-replace cheap now, painful as call sites grow).

```ts
type ChildProviderResolution =
  | { status: "signed-out" }
  | { status: "forbidden" }
  | { status: "loading" }
  | { status: "no-user-doc" }
  | { status: "no-child" }
  | { status: "ready"; child: Child };
```

States deliberately omitted: `auth-error` (current `useAuth` collapses to `signed_out`), `stale-token` (Firebase SDK auto-refreshes), `account-deleting` (no such flow exists). Add later if needed.

Layout becomes a single `switch`:

```tsx
function SignedInLayout({ children }: { children: ReactNode }) {
  const r = useSessionResolution();
  switch (r.status) {
    case "signed-out":  return <SignIn />;
    case "forbidden":   return <NotAllowed />;
    case "loading":     return <Spinner />;
    case "no-user-doc":
    case "no-child":    return <Welcome />;
    case "ready":       return (
      <ChildProvider child={r.child}>
        <AppShell ...>{children}</AppShell>
      </ChildProvider>
    );
  }
}
```

**Onboarding submit** (provisional on Exp 2):
```ts
// Welcome's submit handler — calls the helper from §3b.
await onboardChild(inputs, { onError: setError });
// No success-path code. The helper's shape enforces this — see §3b.
```

---

## §3a Submit lifecycle — the unmount-during-await invariant

The success path of `batch.commit()` resolves, the subscription echoes, the layout `switch` flips to `ready`, and `<Welcome />` **unmounts**. Any post-`await` code on the success path runs on an unmounted component → React warning at best, state-update-after-unmount class bugs at worst.

The invariant:

| Path | Allowed after the batch resolves |
|---|---|
| Success | **Nothing.** No `setState`, no logging, no navigation. The unmount is the success signal. |
| Failure (catch) | `setError` + `setSubmitting(false)` are safe — the throw means no childIds were written, layout stays on `<Welcome />`, component stays mounted. |

This invariant is enforced **structurally** by the §3b helper, not by reviewer vigilance — see next section. No `isMountedRef` / `AbortController` needed; telemetry (if added later) fires *before* the await or via an external queue.

---

## §3b Helper modules

Two helpers extracted as part of PR A. Both convert friction in the proposed architecture into real seams.

### `onboardChild(inputs, { onError })`

**Replaces:** the inline 4-doc `writeBatch` (Child + Settings + User + Day 1) in `welcome/page.tsx` today, plus the duplicate batch shape PR C's onboarding step 3 would otherwise re-implement.

**Shape:**
- Takes the user-provided inputs (displayName, dob, parent1, parent2, wakeTime, and the optional `ownerOverrides` map PR C adds).
- Internally constructs and commits the writeBatch.
- Takes an `onError` callback (and *no* success callback by design — see §3a).
- Returns nothing (success path is the layout flip).

**Why it lives here:** locality — all onboarding-write logic in one module; one place to update when the doc set grows (e.g., daycareSchedule). Test surface — one emulator-backed test against the real batch; eliminates the mock-`batch.set()` theater in `welcome/page.test.tsx`. PR C reuses the helper rather than duplicating the batch.

### Snapshot-await primitive — **deferred**

The §5 invite-accept flow inlines a 15-line `Promise` wrapping `onSnapshot` with a timeout. Today it has one consumer.

**Extract only if:** Exp 2 fails (then §3 onboarding submit also needs an explicit await-snapshot-echo path → two consumers), OR a third write-then-wait flow appears. Don't pre-abstract for one caller per workspace `behavior.md` — "three similar lines is better than a premature abstraction."

---

## §4 Deep-link behavior — land where you entered

When `(signed-in)/layout.tsx` returns `<Welcome />`, it does NOT render `{children}`. Sub-route pages don't mount. After onboarding:

| Entry URL | After onboarding | Behavior |
|---|---|---|
| `/` | Dashboard at `/` | Happy path |
| `/timeline` | Timeline at `/timeline` | Land where you entered |
| `/tomorrow` | Tomorrow at `/tomorrow` | Land where you entered |

**Decided:** accept "land where you entered." Welcome is once-per-account; whichever URL the user originally targeted is also valid post-onboarding. URL bar reads e.g. `/timeline` while Welcome renders — accepted because Welcome is one-shot and the bookmark target post-onboarding is valid. Avoids re-introducing the redirect-cascade pattern §2 indicts.

---

## §5 Invite acceptance under the new layout

Co-parent accepts an invite → invite write adds childId to their user doc → navigate to `/`. Two failure modes if we navigate before the subscription echoes:
- **Empty childIds** (first-time co-parent): layout renders `<Welcome />` — destructive, user could fill out a second-child form
- **Non-empty childIds** (existing parent of another child): layout renders Dashboard for the *previous* child — wrong child briefly visible

Both fixed by awaiting one matching snapshot before navigating:

```ts
// In /invite/[token]/page.tsx after consumeInvite resolves:
const { childId: invitedChildId } = await consumeInvite(/* ... */);
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => {
    unsub();
    reject(new Error("invite-accept: user-doc echo timeout 5s"));
  }, 5000);
  const unsub = onSnapshot(userDocRef(uid), (snap) => {
    if (snap.data()?.childIds?.includes(invitedChildId)) {
      clearTimeout(timeout);
      unsub();
      resolve();
    }
  });
});
router.replace("/");
```

Timeout fallback degrades to current behavior (brief Welcome or wrong-child flash) rather than hanging. Smoke-tested before merge. Inline today (one consumer); §3b describes when to extract.

---

## §6 PR C coupling audit

PR C (re-applying onboarding step 3 on collapsed shell) is not "small follow-on." Pre-verified: `src/v3/engine/**` has zero `useCurrentChild` / `ChildContext` references — engine is pure, no coupling.

| Coupling | What PR C must address |
|---|---|
| Step 3 submit uses `window.location.href` | Replace with a call to the §3b `onboardChild` helper (pass `ownerOverrides` arg); §3a unmount invariant comes for free |
| Day 1 doc commits with `status: "active"` | Verify `useReconcileActiveDay` no-ops because date matches today |
| Any pre-Welcome rendered component (`TomorrowPreview`, F46 chip-tap drawer) | Must not transitively call `useCurrentChild()` (no ChildProvider mounted yet) |
| `useV3User` stale-callback guard | Re-test under React 19 strict-mode double-effects |
| Tomorrow-surfaces autosave (PR B) | Verify autosave doesn't race the just-committed Day 1 |

PR #213's branch is closed without merge: step 3 onboarding logic is re-implemented in PR C atop the collapsed shell; tomorrow-surface components carry over to PR B largely unchanged.

Re-estimate PR C: roughly the original PR #213 onboarding step 3 effort, not "on top of."

---

## §7 Implementation steps

| # | Step |
|---|---|
| 0 | Run §1 experiments. Branch on outcomes. |
| 0a | Grep `src/`, `docs/`, and any invite email templates (PR #193 stub at `src/v3/repositories/invites.ts` and consumers) for `/welcome` and `/sign-in`. Add Next.js `redirects()` if any external refs exist. |
| 1 | Expand the resolution union to include auth states AND rename `useChildResolution` → `useSessionResolution` across all call sites (§3) |
| 2 | Extract `onboardChild` helper from current `welcome/page.tsx` submit (§3b) — covered by emulator-backed test, replaces inline batch |
| 3 | Introduce `(signed-in)/layout.tsx` with the switch |
| 4 | Move `WelcomePage` → `<Welcome />` component under `_welcome/`; submit calls `onboardChild` |
| 5 | Migrate `(signed-in-with-child)/...` pages under `(signed-in)/` |
| 6 | Delete `(signed-in-no-child)/`, `(signed-in-with-child)/`, `/sign-in/page.tsx`, `/welcome/page.tsx` |
| 7 | Update invite route to await echo per §5 |
| 8 | Remove `everReadyRef`; remove any remaining `window.location.href` |
| 9 | Update tests (§9) |

**Estimate:** 4–8h for the architecture work. Exp 2 harness build (separate): 3–6h, possibly more if `@/lib/firebase/client`'s module-singleton `db` needs to be made injectable to point at the emulator instance. Honest framing: do Exp 1 first (~15 min); if it fails, the harness work is moot.

**PR split point if needed:** between step 6 and step 7. Steps 1–6 must ship atomically (the rename, helper extraction, layout collapse, and route migration are inseparable — half-shipped leaves duplicate routes or duplicate batch logic). Steps 7–9 can ship as PR A.2 if PR A.1 needs to bake.

---

## §8 Risks

| Risk | Mitigation |
|---|---|
| Exp 1 fails | Re-scope; PR A doesn't fix the bug |
| Exp 2 fails | Swap §3 submit to explicit refetch |
| Exp 3 fails | Re-scope around middleware auth |
| Welcome flash after sign-in (no everReadyRef) | Click-test under Slow 3G throttle pre-merge; if flash >200ms, add a one-shot ref guard inside the new layout |
| Invite-accept flash | Mechanism specified in §5; smoke-test required |
| React 19 strict-mode double-effects in layout switch | Pattern any new effects after the invite route's `startedRef` guard |
| Next.js 16 caching/RSC quirks beyond what Exp 3 covers | Manual click-test of every sub-route after PR A; not theoretical |
| Bug recurs silently in prod | Observability deferred — the ≥48h bake gate + the new seam test are the regression-detection plan. Add console-error → telemetry capture only if the bake catches anything. |

---

## §9 Tests

| Test | Disposition |
|---|---|
| `(signed-in-no-child)/welcome/page.test.tsx` | Split: (a) `Welcome.test.tsx` asserts the submit handler calls `onboardChild` with the right inputs (mock the helper); (b) new `onboardChild.test.ts` exercises the real batch against the emulator. Drops `locationHrefSetter` + `router.replace` + `batch.set` mocks. |
| `(signed-in-with-child)/layout.test.tsx` | Delete (the seam test below covers the branches with real implementations; per-branch mock-driven enumeration is theater). |
| `/sign-in/page.test.tsx` | Delete; SignIn component has its own test |
| Existing `tests/integration/onboarding.test.ts` | Unchanged |
| **NEW required: `tests/integration/onboarding-collapse.test.ts`** | Real-emulator seam test. Mount `(signed-in)/layout.tsx`, sign in via emulator auth, render Welcome, submit the 4-doc writeBatch via the real handler, assert layout flips to Dashboard within 1s with zero `permission-denied` logs. **Required to merge PR A.** |
| **NEW required: invite-accept smoke** | Seed user with `childIds: []`, accept invite, assert no `<Welcome />` flash, land on Dashboard. |

---

## §10 Success criteria (PR A merges when all true)

1. Exp 1 passed (or PR A re-scoped accordingly).
2. Exp 2 passed (or §3 submit swapped to refetch).
3. Exp 3 passed (or re-scoped around middleware).
4. `tests/integration/onboarding-collapse.test.ts` passes 10/10 runs locally.
5. Click-test: emulator wipe → sign-in → onboard → dashboard renders with zero console errors AND URL stays at `/` for happy path.
6. Click-test: deep-link to `/timeline` pre-onboarding → submit → land on Timeline at `/timeline` per §4.
7. Click-test: invite-accept by co-parent with `childIds: []` → no Welcome flash, lands on Dashboard.
8. Slow-3G throttle: no `<Welcome />` flash >200ms after sign-in for a returning user.
9. Full unit + integration suite green locally.

---

## §11 Rollback

PR A touches the auth/routing root. Routing/rendering changes only — no Firestore schema, doc shape, or writeBatch changes. Revert is `git revert <PR A merge>`.

**Bake gate:** PR A must sit on main for ≥48h with manual smoke tests before PR B or PR C open. Within the bake window, regressions revert as a single PR. After PR B/C land, revert becomes a coordinated 3-PR unwind — much more expensive.
