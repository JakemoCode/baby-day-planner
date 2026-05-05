# Baby Day Planner — Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the scheduling engine to Firestore + Firebase Auth so two authorized users (Jake + Kelly) can read and write a shared baby's day in realtime, with optimistic UI updates and a sync-status indicator.

**Architecture:** A thin three-layer Firestore client. `src/lib/firestore/` defines collection paths and `FirestoreDataConverter` instances that read/write the engine's plain-data types. `src/repositories/` exposes async CRUD + realtime watchers per entity (`settings`, `days`, `events`, `templates`). `src/hooks/` wraps repositories in React hooks (`useSettings`, `useDay`, `useEvents`, `useTemplates`, `useSyncStatus`) for components to consume. Authentication uses Google sign-in with an email allowlist enforced both client-side (gate the UI) and server-side (Firestore security rules). Repositories are tested against the Firebase emulator suite; hooks are unit-tested with mocked repositories.

**Tech Stack:**
- Firebase JS SDK 12+ (`firebase/app`, `firebase/auth`, `firebase/firestore`)
- `@firebase/rules-unit-testing` for security-rule + repository emulator tests
- React 19 hooks (`useSyncExternalStore`, `useOptimistic`)
- Vitest 4
- Firebase Local Emulator Suite (Auth + Firestore) — **requires Java JRE** (`brew install --cask temurin`)

**Prerequisites (must be in place before executing this plan):**
1. **Plan A merged to `main`** — this plan imports types from `@/domain` and assumes the engine ships its public API via `src/domain/index.ts`.
2. **Java JRE installed** — `brew install --cask temurin`. Required by the Firebase emulator suite for tests in Tasks B6, B9, B13, B14.
3. **Real Firebase project created** — run `firebase login` and `firebase projects:create baby-day-planner-jake` (or another available ID) **in your own terminal** (not via Claude Code's bash tool, which is non-interactive). Update `.firebaserc` to use the real project ID.
4. **`.env.local` populated** — fill in the four `NEXT_PUBLIC_FIREBASE_*` values from Firebase Console → Project Settings → Web app → register a new web app.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/firestore/paths.ts` | Typed collection/doc path helpers (`childRef`, `dayRef`, `eventRef`, ...) |
| `src/lib/firestore/converters.ts` | `FirestoreDataConverter<T>` instances for each entity |
| `src/lib/auth/allowlist.ts` | Hardcoded list of authorized emails |
| `src/lib/auth/AuthProvider.tsx` | Client-side React provider — listens to Firebase Auth state, exposes user, blocks non-allowlisted emails |
| `src/lib/auth/useAuth.ts` | Hook accessor for the auth context |
| `src/lib/auth/SignIn.tsx` | Sign-in screen (Google button, error states) |
| `src/repositories/settings.ts` | `getSettings`, `saveSettings`, `watchSettings` |
| `src/repositories/days.ts` | `getDay`, `getDayByDate`, `watchActiveDay`, `archiveDay`, `createDay`, `updateDay` |
| `src/repositories/events.ts` | `listEvents`, `watchEvents`, `createEvent`, `updateEvent`, `deleteEvent` |
| `src/repositories/templates.ts` | `listTemplates`, `saveTemplate`, `deleteTemplate` |
| `src/repositories/startNewDay.ts` | The archive-and-promote transaction |
| `src/hooks/useSettings.ts` | Realtime hook for settings |
| `src/hooks/useDay.ts` | Realtime hook for the active day |
| `src/hooks/useEvents.ts` | Realtime hook for a day's events with optimistic mutations |
| `src/hooks/useTemplates.ts` | One-shot fetch + cache for templates |
| `src/hooks/useSyncStatus.ts` | Online/offline + last-synced indicator |
| `src/app/(authed)/layout.tsx` | Auth-gated layout, redirects unauthorized users |
| `src/app/sign-in/page.tsx` | Public sign-in route |
| `firestore.rules` | Security rules with email allowlist |
| `firestore.indexes.json` | Composite indexes (events ordered by startTime within a day) |
| `tests/integration/firestore-test-utils.ts` | Test harness for emulator (`initializeTestEnvironment`, fixtures) |
| `tests/integration/rules.test.ts` | Security rule assertions |
| `tests/integration/dayLifecycle.test.ts` | End-to-end day lifecycle on emulator |

---

## Task B1: Firestore paths + converters

**Files:**
- Create: `src/lib/firestore/paths.ts`, `src/lib/firestore/converters.ts`
- Test: `src/lib/firestore/paths.test.ts`

- [ ] **Step 1: Write failing test for paths**

Create `src/lib/firestore/paths.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CHILDREN, settingsPath, dayPath, eventPath, templatePath } from "./paths";

describe("Firestore paths", () => {
  it("exposes the root collection name", () => {
    expect(CHILDREN).toBe("children");
  });

  it("returns the singleton settings doc path under a child", () => {
    expect(settingsPath("child-1")).toBe("children/child-1/settings/current");
  });

  it("returns a day doc path under a child", () => {
    expect(dayPath("child-1", "day-1")).toBe("children/child-1/days/day-1");
  });

  it("returns an event doc path under a day", () => {
    expect(eventPath("child-1", "day-1", "ev-1")).toBe(
      "children/child-1/days/day-1/events/ev-1",
    );
  });

  it("returns a template doc path under a child", () => {
    expect(templatePath("child-1", "tmpl-saturday")).toBe(
      "children/child-1/templates/tmpl-saturday",
    );
  });
});
```

- [ ] **Step 2: Run — module not found**

```bash
pnpm test src/lib/firestore/paths.test.ts
```

- [ ] **Step 3: Implement `src/lib/firestore/paths.ts`**

```ts
export const CHILDREN = "children";

export function childPath(childId: string): string {
  return `${CHILDREN}/${childId}`;
}

export function settingsPath(childId: string): string {
  return `${childPath(childId)}/settings/current`;
}

export function daysCollectionPath(childId: string): string {
  return `${childPath(childId)}/days`;
}

export function dayPath(childId: string, dayId: string): string {
  return `${daysCollectionPath(childId)}/${dayId}`;
}

export function eventsCollectionPath(childId: string, dayId: string): string {
  return `${dayPath(childId, dayId)}/events`;
}

export function eventPath(childId: string, dayId: string, eventId: string): string {
  return `${eventsCollectionPath(childId, dayId)}/${eventId}`;
}

export function templatesCollectionPath(childId: string): string {
  return `${childPath(childId)}/templates`;
}

export function templatePath(childId: string, templateId: string): string {
  return `${templatesCollectionPath(childId)}/${templateId}`;
}
```

- [ ] **Step 4: Run — 5 passed**

- [ ] **Step 5: Implement `src/lib/firestore/converters.ts`**

Firestore data converters keep the engine's flat `Settings` / `Day` / `Event` / `OwnershipTemplate` shape on the wire. No transformations needed; converters exist purely to give us typed `DocumentReference<T>` and `Query<T>`.

```ts
import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
} from "firebase/firestore";
import type { Day, Event, OwnershipTemplate, Settings } from "@/domain";

function passthrough<T extends object>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (data) => data,
    fromFirestore: (snap: QueryDocumentSnapshot, opts?: SnapshotOptions) => {
      return snap.data(opts) as T;
    },
  };
}

export const settingsConverter = passthrough<Settings>();
export const dayConverter = passthrough<Day>();
export const eventConverter = passthrough<Event>();
export const templateConverter = passthrough<OwnershipTemplate>();
```

- [ ] **Step 6: Verify typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/firestore/
git commit -m "feat(firestore): typed paths + passthrough converters for engine entities"
```

Append `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Task B2: Auth allowlist + AuthProvider

**Files:**
- Create: `src/lib/auth/allowlist.ts`, `src/lib/auth/AuthProvider.tsx`, `src/lib/auth/useAuth.ts`, `src/lib/auth/AuthProvider.test.tsx`

- [ ] **Step 1: Write `src/lib/auth/allowlist.ts`**

```ts
// Authorized users for the Baby Day Planner.
// Replace these with the real emails when the project is set up.
// To add a third user, add their email to the array AND to firestore.rules.
export const ALLOWLISTED_EMAILS: readonly string[] = [
  "jake136@yahoo.com",
  // Add Kelly's email here
] as const;

export function isAllowlisted(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWLISTED_EMAILS.includes(email.toLowerCase());
}
```

- [ ] **Step 2: Write failing test `src/lib/auth/AuthProvider.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

vi.mock("@/lib/firebase/client", () => ({
  auth: { currentUser: null },
}));

const mockOnAuthStateChanged = vi.fn();
vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>("firebase/auth");
  return {
    ...actual,
    onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
    signOut: vi.fn().mockResolvedValue(undefined),
    GoogleAuthProvider: actual.GoogleAuthProvider,
    signInWithPopup: vi.fn(),
  };
});

function Probe() {
  const { user, status } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? "none"}</span>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    mockOnAuthStateChanged.mockReset();
  });

  it("starts in 'loading' state", () => {
    mockOnAuthStateChanged.mockImplementation(() => () => {});
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
  });

  it("transitions to 'authorized' for an allowlisted email", async () => {
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      cb({ uid: "u1", email: "jake136@yahoo.com" });
      return () => {};
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authorized");
    });
    expect(screen.getByTestId("email")).toHaveTextContent("jake136@yahoo.com");
  });

  it("transitions to 'forbidden' for a non-allowlisted email", async () => {
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      cb({ uid: "u2", email: "stranger@example.com" });
      return () => {};
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("forbidden");
    });
  });

  it("transitions to 'signed_out' when no user", async () => {
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      cb(null);
      return () => {};
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("signed_out");
    });
  });
});
```

- [ ] **Step 3: Run — module not found**

- [ ] **Step 4: Implement `src/lib/auth/AuthProvider.tsx`**

```tsx
"use client";

import { createContext, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { isAllowlisted } from "./allowlist";

export type AuthStatus = "loading" | "signed_out" | "authorized" | "forbidden";

export type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setStatus("signed_out");
      } else if (isAllowlisted(u.email)) {
        setStatus("authorized");
      } else {
        setStatus("forbidden");
      }
    });
  }, []);

  const value: AuthContextValue = {
    user,
    status,
    async signIn() {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    },
    async signOut() {
      await signOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 5: Implement `src/lib/auth/useAuth.ts`**

```ts
"use client";

import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "./AuthProvider";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 6: Run — 4 passed**

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/
git commit -m "feat(auth): AuthProvider with email allowlist enforcement"
```

Append the standard co-author footer.

---

## Task B3: Sign-in screen + auth gate

**Files:**
- Create: `src/lib/auth/SignIn.tsx`, `src/app/sign-in/page.tsx`, `src/app/(authed)/layout.tsx`
- Create: `src/lib/auth/SignIn.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignIn } from "./SignIn";

const signInMock = vi.fn().mockResolvedValue(undefined);
vi.mock("./useAuth", () => ({
  useAuth: () => ({ signIn: signInMock, status: "signed_out", user: null, signOut: vi.fn() }),
}));

describe("SignIn", () => {
  it("renders a Google sign-in button", () => {
    render(<SignIn />);
    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
  });

  it("invokes signIn when clicked", async () => {
    render(<SignIn />);
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(signInMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — module not found**

- [ ] **Step 3: Implement `src/lib/auth/SignIn.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useAuth } from "./useAuth";

export function SignIn() {
  const { signIn, status } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    try {
      await signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    }
  }

  return (
    <main style={{ padding: "var(--space-4)", maxWidth: "var(--content-max)", margin: "0 auto" }}>
      <h1>Baby Day Planner</h1>
      <p>Sign in to continue.</p>
      <button type="button" onClick={handleClick}>
        Sign in with Google
      </button>
      {status === "forbidden" && (
        <p role="alert" style={{ color: "var(--color-danger)" }}>
          This account is not authorized.
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Implement `src/app/sign-in/page.tsx`**

```tsx
import { SignIn } from "@/lib/auth/SignIn";

export default function SignInPage() {
  return <SignIn />;
}
```

- [ ] **Step 5: Implement `src/app/(authed)/layout.tsx`**

```tsx
"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";

export default function AuthedLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed_out" || status === "forbidden") {
      router.replace("/sign-in");
    }
  }, [status, router]);

  if (status !== "authorized") {
    return (
      <main style={{ padding: "var(--space-4)" }}>
        <p>Loading…</p>
      </main>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 6: Wire AuthProvider into root layout — modify `src/app/layout.tsx`**

```tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth/AuthProvider";

export const metadata: Metadata = {
  title: "Baby Day Planner",
  description: "What happens next, and how did the latest bottle/nap change today?",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Run — 2 passed (SignIn) + existing tests still pass**

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/SignIn.tsx src/lib/auth/SignIn.test.tsx src/app/sign-in/ src/app/\(authed\)/ src/app/layout.tsx
git commit -m "feat(auth): sign-in screen and auth-gated layout"
```

---

## Task B4: Settings repository

**Files:**
- Create: `src/repositories/settings.ts`, `src/repositories/settings.test.ts`
- Create: `tests/integration/firestore-test-utils.ts`

- [ ] **Step 1: Write `tests/integration/firestore-test-utils.ts`** — emulator harness shared by all repo tests

```ts
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ID = "baby-day-planner-test";

export async function startTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
      host: "localhost",
      port: 8080,
    },
  });
}

export const ALLOWED_USER = { uid: "jake-uid", email: "jake136@yahoo.com" };
export const FORBIDDEN_USER = { uid: "stranger-uid", email: "stranger@example.com" };
```

- [ ] **Step 2: Install testing dependency**

```bash
pnpm add -D @firebase/rules-unit-testing
```

- [ ] **Step 3: Write failing repository test `src/repositories/settings.test.ts`**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { startTestEnv, ALLOWED_USER } from "../../tests/integration/firestore-test-utils";
import { getSettings, saveSettings } from "./settings";
import { sampleSettings } from "@/domain/__fixtures__/sample";

describe("settings repository", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await startTestEnv();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
  });

  it("returns null when no settings document exists", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore();
    expect(await getSettings(db, "child-1")).toBeNull();
  });

  it("round-trips settings", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore();
    await saveSettings(db, "child-1", sampleSettings);
    const loaded = await getSettings(db, "child-1");
    expect(loaded).toEqual(sampleSettings);
  });
});
```

> **Note on signature:** repositories take a `Firestore` instance as the first argument so emulator tests can inject test-environment Firestore handles. The hooks (Task B5+) will pass the real `db` from `@/lib/firebase/client`.

- [ ] **Step 4: Run — module not found**

```bash
pnpm test src/repositories/settings.test.ts
```

(Tests will additionally fail because the emulator isn't running. Document that emulator must be started first: `firebase emulators:start --only firestore` in a separate terminal. Add a `test:integration` script in Task B14.)

- [ ] **Step 5: Implement `src/repositories/settings.ts`**

```ts
import { doc, getDoc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import type { Settings } from "@/domain";
import { settingsPath } from "@/lib/firestore/paths";
import { settingsConverter } from "@/lib/firestore/converters";

function settingsRef(db: Firestore, childId: string) {
  return doc(db, settingsPath(childId)).withConverter(settingsConverter);
}

export async function getSettings(db: Firestore, childId: string): Promise<Settings | null> {
  const snap = await getDoc(settingsRef(db, childId));
  return snap.exists() ? snap.data() : null;
}

export async function saveSettings(
  db: Firestore,
  childId: string,
  settings: Settings,
): Promise<void> {
  await setDoc(settingsRef(db, childId), settings);
}

export function watchSettings(
  db: Firestore,
  childId: string,
  cb: (settings: Settings | null) => void,
): () => void {
  return onSnapshot(settingsRef(db, childId), (snap) => {
    cb(snap.exists() ? snap.data() : null);
  });
}
```

- [ ] **Step 6: Boot the emulator and run the test**

In a separate terminal:

```bash
firebase emulators:start --only firestore --project baby-day-planner-test
```

Then in your main terminal:

```bash
pnpm test src/repositories/settings.test.ts
```

Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add src/repositories/settings.ts src/repositories/settings.test.ts tests/integration/firestore-test-utils.ts package.json pnpm-lock.yaml
git commit -m "feat(repo): settings repository with emulator-backed tests"
```

---

## Task B5: useSettings hook

**Files:**
- Create: `src/hooks/useSettings.ts`, `src/hooks/useSettings.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSettings } from "./useSettings";
import { sampleSettings } from "@/domain/__fixtures__/sample";

const watchSettingsMock = vi.fn();
vi.mock("@/repositories/settings", () => ({
  watchSettings: (...args: unknown[]) => watchSettingsMock(...args),
}));

vi.mock("@/lib/firebase/client", () => ({
  db: {},
}));

describe("useSettings", () => {
  it("returns loading=true initially, then settings once watcher fires", async () => {
    let cb: ((s: typeof sampleSettings | null) => void) | undefined;
    watchSettingsMock.mockImplementation((_db, _childId, callback) => {
      cb = callback;
      return () => {};
    });

    const { result } = renderHook(() => useSettings("child-1"));
    expect(result.current.loading).toBe(true);
    expect(result.current.settings).toBeNull();

    cb!(sampleSettings);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.settings).toEqual(sampleSettings);
    });
  });

  it("unsubscribes on unmount", () => {
    const unsub = vi.fn();
    watchSettingsMock.mockImplementation(() => unsub);
    const { unmount } = renderHook(() => useSettings("child-1"));
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — module not found**

- [ ] **Step 3: Implement `src/hooks/useSettings.ts`**

```ts
"use client";

import { useEffect, useState } from "react";
import type { Settings } from "@/domain";
import { db } from "@/lib/firebase/client";
import { watchSettings } from "@/repositories/settings";

export type UseSettingsResult = {
  settings: Settings | null;
  loading: boolean;
};

export function useSettings(childId: string): UseSettingsResult {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    return watchSettings(db, childId, (s) => {
      setSettings(s);
      setLoading(false);
    });
  }, [childId]);

  return { settings, loading };
}
```

- [ ] **Step 4: Run — 2 passed**

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSettings.ts src/hooks/useSettings.test.tsx
git commit -m "feat(hooks): useSettings with realtime watch + mocked unit tests"
```

---

## Task B6: Day repository

**Files:**
- Create: `src/repositories/days.ts`, `src/repositories/days.test.ts`

- [ ] **Step 1: Write failing test `src/repositories/days.test.ts`**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { startTestEnv, ALLOWED_USER } from "../../tests/integration/firestore-test-utils";
import {
  createDay,
  getDay,
  getDayByDate,
  archiveDay,
  watchActiveDay,
} from "./days";
import type { Day } from "@/domain";

const baseDay = (overrides: Partial<Day>): Day => ({
  id: "day-1",
  childId: "child-1",
  date: "2026-05-05",
  status: "active",
  wakeTime: "07:00",
  createdAt: "2026-05-05T07:00:00Z",
  ...overrides,
});

describe("days repository", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await startTestEnv();
  });
  afterAll(async () => {
    await env.cleanup();
  });
  beforeEach(async () => {
    await env.clearFirestore();
  });

  it("creates and reads back a day", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore();
    const day = baseDay({});
    await createDay(db, day);
    expect(await getDay(db, "child-1", "day-1")).toEqual(day);
  });

  it("finds a day by date", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore();
    await createDay(db, baseDay({ id: "d-1", date: "2026-05-04" }));
    await createDay(db, baseDay({ id: "d-2", date: "2026-05-05" }));
    const found = await getDayByDate(db, "child-1", "2026-05-05");
    expect(found?.id).toBe("d-2");
  });

  it("archives a day, setting status and archivedAt", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore();
    await createDay(db, baseDay({}));
    await archiveDay(db, "child-1", "day-1", "2026-05-06T07:00:00Z");
    const archived = await getDay(db, "child-1", "day-1");
    expect(archived?.status).toBe("archived");
    expect(archived?.archivedAt).toBe("2026-05-06T07:00:00Z");
  });

  it("watchActiveDay returns the unique day with status='active'", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore();
    await createDay(db, baseDay({ id: "d-1", date: "2026-05-04", status: "archived" }));
    await createDay(db, baseDay({ id: "d-2", date: "2026-05-05", status: "active" }));

    const seen: (Day | null)[] = [];
    const unsub = watchActiveDay(db, "child-1", (d) => seen.push(d));
    await new Promise((r) => setTimeout(r, 200));
    unsub();
    expect(seen.at(-1)?.id).toBe("d-2");
  });
});
```

- [ ] **Step 2: Run — module not found**

- [ ] **Step 3: Implement `src/repositories/days.ts`**

```ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import type { Day } from "@/domain";
import { dayConverter } from "@/lib/firestore/converters";
import { dayPath, daysCollectionPath } from "@/lib/firestore/paths";

function dayRef(db: Firestore, childId: string, dayId: string) {
  return doc(db, dayPath(childId, dayId)).withConverter(dayConverter);
}

function daysRef(db: Firestore, childId: string) {
  return collection(db, daysCollectionPath(childId)).withConverter(dayConverter);
}

export async function createDay(db: Firestore, day: Day): Promise<void> {
  await setDoc(dayRef(db, day.childId, day.id), day);
}

export async function getDay(
  db: Firestore,
  childId: string,
  dayId: string,
): Promise<Day | null> {
  const snap = await getDoc(dayRef(db, childId, dayId));
  return snap.exists() ? snap.data() : null;
}

export async function getDayByDate(
  db: Firestore,
  childId: string,
  date: string,
): Promise<Day | null> {
  const q = query(daysRef(db, childId), where("date", "==", date), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0]!.data();
}

export async function archiveDay(
  db: Firestore,
  childId: string,
  dayId: string,
  archivedAt: string,
): Promise<void> {
  await updateDoc(dayRef(db, childId, dayId), { status: "archived", archivedAt });
}

export async function updateDay(
  db: Firestore,
  childId: string,
  dayId: string,
  patch: Partial<Day>,
): Promise<void> {
  await updateDoc(dayRef(db, childId, dayId), patch);
}

export function watchActiveDay(
  db: Firestore,
  childId: string,
  cb: (day: Day | null) => void,
): () => void {
  const q = query(daysRef(db, childId), where("status", "==", "active"), limit(1));
  return onSnapshot(q, (snap) => {
    cb(snap.empty ? null : snap.docs[0]!.data());
  });
}
```

- [ ] **Step 4: Run with emulator — 4 passed**

- [ ] **Step 5: Commit**

```bash
git add src/repositories/days.ts src/repositories/days.test.ts
git commit -m "feat(repo): days repository with active-day watcher"
```

---

## Task B7: useDay hook

**Files:**
- Create: `src/hooks/useDay.ts`, `src/hooks/useDay.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Day } from "@/domain";
import { useDay } from "./useDay";

const watchActiveDayMock = vi.fn();
vi.mock("@/repositories/days", () => ({
  watchActiveDay: (...args: unknown[]) => watchActiveDayMock(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ db: {} }));

const sampleDay: Day = {
  id: "d-1",
  childId: "child-1",
  date: "2026-05-05",
  status: "active",
  wakeTime: "07:00",
  createdAt: "2026-05-05T07:00:00Z",
};

describe("useDay", () => {
  it("returns the active day from the watcher", async () => {
    let cb: ((d: Day | null) => void) | undefined;
    watchActiveDayMock.mockImplementation((_db, _cid, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useDay("child-1"));
    expect(result.current.loading).toBe(true);
    cb!(sampleDay);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.day).toEqual(sampleDay);
    });
  });
});
```

- [ ] **Step 2: Run — module not found**

- [ ] **Step 3: Implement `src/hooks/useDay.ts`**

```ts
"use client";

import { useEffect, useState } from "react";
import type { Day } from "@/domain";
import { db } from "@/lib/firebase/client";
import { watchActiveDay } from "@/repositories/days";

export type UseDayResult = {
  day: Day | null;
  loading: boolean;
};

export function useDay(childId: string): UseDayResult {
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    return watchActiveDay(db, childId, (d) => {
      setDay(d);
      setLoading(false);
    });
  }, [childId]);

  return { day, loading };
}
```

- [ ] **Step 4: Run — 1 passed**

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDay.ts src/hooks/useDay.test.tsx
git commit -m "feat(hooks): useDay watches the active day"
```

---

## Task B8: Events repository

**Files:**
- Create: `src/repositories/events.ts`, `src/repositories/events.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { startTestEnv, ALLOWED_USER } from "../../tests/integration/firestore-test-utils";
import {
  createEvent,
  deleteEvent,
  listEvents,
  updateEvent,
  watchEvents,
} from "./events";
import type { Event } from "@/domain";

const ev = (overrides: Partial<Event>): Event => ({
  id: "e-1",
  dayId: "day-1",
  eventKey: "bottle_1",
  type: "bottle",
  label: "Bottle 1",
  startTime: "07:05",
  amountOz: 5,
  source: "actual",
  status: "actual",
  ...overrides,
});

describe("events repository", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await startTestEnv();
  });
  afterAll(async () => {
    await env.cleanup();
  });
  beforeEach(async () => {
    await env.clearFirestore();
  });

  it("creates, lists, updates, and deletes events", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore();

    await createEvent(db, "child-1", ev({}));
    await createEvent(db, "child-1", ev({ id: "e-2", eventKey: "nap_1", type: "nap", startTime: "09:00", endTime: "10:00", label: "Nap 1" }));

    let listed = await listEvents(db, "child-1", "day-1");
    expect(listed).toHaveLength(2);

    await updateEvent(db, "child-1", "day-1", "e-1", { amountOz: 6 });
    listed = await listEvents(db, "child-1", "day-1");
    expect(listed.find((e) => e.id === "e-1")?.amountOz).toBe(6);

    await deleteEvent(db, "child-1", "day-1", "e-2");
    listed = await listEvents(db, "child-1", "day-1");
    expect(listed).toHaveLength(1);
  });

  it("watches events ordered by startTime", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore();
    await createEvent(db, "child-1", ev({ id: "e-1", startTime: "10:00" }));
    await createEvent(db, "child-1", ev({ id: "e-2", startTime: "07:00" }));
    await createEvent(db, "child-1", ev({ id: "e-3", startTime: "12:00" }));

    const seen: Event[][] = [];
    const unsub = watchEvents(db, "child-1", "day-1", (events) => seen.push(events));
    await new Promise((r) => setTimeout(r, 200));
    unsub();
    const last = seen.at(-1)!;
    expect(last.map((e) => e.id)).toEqual(["e-2", "e-1", "e-3"]);
  });
});
```

- [ ] **Step 2: Run — module not found**

- [ ] **Step 3: Implement `src/repositories/events.ts`**

```ts
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import type { Event } from "@/domain";
import { eventConverter } from "@/lib/firestore/converters";
import { eventPath, eventsCollectionPath } from "@/lib/firestore/paths";

function eventRef(db: Firestore, childId: string, dayId: string, eventId: string) {
  return doc(db, eventPath(childId, dayId, eventId)).withConverter(eventConverter);
}

function eventsRef(db: Firestore, childId: string, dayId: string) {
  return collection(db, eventsCollectionPath(childId, dayId)).withConverter(eventConverter);
}

export async function createEvent(
  db: Firestore,
  childId: string,
  event: Event,
): Promise<void> {
  await setDoc(eventRef(db, childId, event.dayId, event.id), event);
}

export async function updateEvent(
  db: Firestore,
  childId: string,
  dayId: string,
  eventId: string,
  patch: Partial<Event>,
): Promise<void> {
  await updateDoc(eventRef(db, childId, dayId, eventId), patch);
}

export async function deleteEvent(
  db: Firestore,
  childId: string,
  dayId: string,
  eventId: string,
): Promise<void> {
  await deleteDoc(eventRef(db, childId, dayId, eventId));
}

export async function listEvents(
  db: Firestore,
  childId: string,
  dayId: string,
): Promise<Event[]> {
  const q = query(eventsRef(db, childId, dayId), orderBy("startTime"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export function watchEvents(
  db: Firestore,
  childId: string,
  dayId: string,
  cb: (events: Event[]) => void,
): () => void {
  const q = query(eventsRef(db, childId, dayId), orderBy("startTime"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => d.data()));
  });
}
```

- [ ] **Step 4: Run with emulator — 2 passed**

- [ ] **Step 5: Commit**

```bash
git add src/repositories/events.ts src/repositories/events.test.ts
git commit -m "feat(repo): events repository ordered by startTime"
```

---

## Task B9: useEvents hook with optimistic mutations

**Files:**
- Create: `src/hooks/useEvents.ts`, `src/hooks/useEvents.test.tsx`

The hook returns: `{ events, loading, createOptimistic, updateOptimistic, deleteOptimistic }`. Optimistic mutations apply the change locally immediately, then persist via the repository; on persist failure, the next watcher snapshot reverts.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Event } from "@/domain";
import { useEvents } from "./useEvents";

const watchEventsMock = vi.fn();
const createEventMock = vi.fn().mockResolvedValue(undefined);
const updateEventMock = vi.fn().mockResolvedValue(undefined);
const deleteEventMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/repositories/events", () => ({
  watchEvents: (...args: unknown[]) => watchEventsMock(...args),
  createEvent: (...args: unknown[]) => createEventMock(...args),
  updateEvent: (...args: unknown[]) => updateEventMock(...args),
  deleteEvent: (...args: unknown[]) => deleteEventMock(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ db: {} }));

const baseEvent = (overrides: Partial<Event>): Event => ({
  id: "e-1",
  dayId: "day-1",
  eventKey: "bottle_1",
  type: "bottle",
  label: "Bottle 1",
  startTime: "07:05",
  amountOz: 5,
  source: "actual",
  status: "actual",
  ...overrides,
});

describe("useEvents", () => {
  it("exposes watched events", async () => {
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useEvents("child-1", "day-1"));
    cb!([baseEvent({})]);
    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
    });
  });

  it("applies createOptimistic immediately, then calls repository", async () => {
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useEvents("child-1", "day-1"));
    cb!([]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newEvent = baseEvent({ id: "e-new" });
    await act(async () => {
      await result.current.createOptimistic(newEvent);
    });
    expect(createEventMock).toHaveBeenCalledWith({}, "child-1", newEvent);
    expect(result.current.events.find((e) => e.id === "e-new")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — module not found**

- [ ] **Step 3: Implement `src/hooks/useEvents.ts`**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Event } from "@/domain";
import { db } from "@/lib/firebase/client";
import {
  createEvent as createEventRepo,
  deleteEvent as deleteEventRepo,
  updateEvent as updateEventRepo,
  watchEvents,
} from "@/repositories/events";

export type UseEventsResult = {
  events: Event[];
  loading: boolean;
  createOptimistic: (event: Event) => Promise<void>;
  updateOptimistic: (eventId: string, patch: Partial<Event>) => Promise<void>;
  deleteOptimistic: (eventId: string) => Promise<void>;
};

export function useEvents(childId: string, dayId: string): UseEventsResult {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    return watchEvents(db, childId, dayId, (next) => {
      setEvents(next);
      setLoading(false);
    });
  }, [childId, dayId]);

  const createOptimistic = useCallback(
    async (event: Event) => {
      setEvents((prev) => [...prev, event].sort((a, b) => a.startTime.localeCompare(b.startTime)));
      await createEventRepo(db, childId, event);
    },
    [childId],
  );

  const updateOptimistic = useCallback(
    async (eventId: string, patch: Partial<Event>) => {
      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, ...patch } : e)));
      await updateEventRepo(db, childId, dayId, eventId, patch);
    },
    [childId, dayId],
  );

  const deleteOptimistic = useCallback(
    async (eventId: string) => {
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      await deleteEventRepo(db, childId, dayId, eventId);
    },
    [childId, dayId],
  );

  return { events, loading, createOptimistic, updateOptimistic, deleteOptimistic };
}
```

- [ ] **Step 4: Run — 2 passed**

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useEvents.ts src/hooks/useEvents.test.tsx
git commit -m "feat(hooks): useEvents with optimistic create/update/delete"
```

---

## Task B10: Templates repository + useTemplates

**Files:**
- Create: `src/repositories/templates.ts`, `src/repositories/templates.test.ts`, `src/hooks/useTemplates.ts`, `src/hooks/useTemplates.test.tsx`

- [ ] **Step 1: Write failing repo test**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { startTestEnv, ALLOWED_USER } from "../../tests/integration/firestore-test-utils";
import { listTemplates, saveTemplate, deleteTemplate } from "./templates";
import type { OwnershipTemplate } from "@/domain";

const t = (id: string, label: string): OwnershipTemplate => ({
  id,
  label,
  napOwners: ["Jake", "Kelly"],
  wakeWindowOwners: ["Kelly", "Jake"],
});

describe("templates repository", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await startTestEnv();
  });
  afterAll(async () => {
    await env.cleanup();
  });
  beforeEach(async () => {
    await env.clearFirestore();
  });

  it("saves, lists, and deletes templates", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore();

    await saveTemplate(db, "child-1", t("tmpl-saturday", "Saturday"));
    await saveTemplate(db, "child-1", t("tmpl-sunday", "Sunday"));
    let listed = await listTemplates(db, "child-1");
    expect(listed.map((x) => x.id).sort()).toEqual(["tmpl-saturday", "tmpl-sunday"]);

    await deleteTemplate(db, "child-1", "tmpl-sunday");
    listed = await listTemplates(db, "child-1");
    expect(listed).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement `src/repositories/templates.ts`**

```ts
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { OwnershipTemplate } from "@/domain";
import { templateConverter } from "@/lib/firestore/converters";
import { templatePath, templatesCollectionPath } from "@/lib/firestore/paths";

function templateRef(db: Firestore, childId: string, templateId: string) {
  return doc(db, templatePath(childId, templateId)).withConverter(templateConverter);
}

function templatesRef(db: Firestore, childId: string) {
  return collection(db, templatesCollectionPath(childId)).withConverter(templateConverter);
}

export async function saveTemplate(
  db: Firestore,
  childId: string,
  template: OwnershipTemplate,
): Promise<void> {
  await setDoc(templateRef(db, childId, template.id), template);
}

export async function listTemplates(
  db: Firestore,
  childId: string,
): Promise<OwnershipTemplate[]> {
  const snap = await getDocs(templatesRef(db, childId));
  return snap.docs.map((d) => d.data());
}

export async function deleteTemplate(
  db: Firestore,
  childId: string,
  templateId: string,
): Promise<void> {
  await deleteDoc(templateRef(db, childId, templateId));
}
```

- [ ] **Step 3: Run with emulator — 1 passed. Commit.**

```bash
git add src/repositories/templates.ts src/repositories/templates.test.ts
git commit -m "feat(repo): templates repository (list/save/delete)"
```

- [ ] **Step 4: Hook test `src/hooks/useTemplates.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTemplates } from "./useTemplates";
import type { OwnershipTemplate } from "@/domain";

const listTemplatesMock = vi.fn();
vi.mock("@/repositories/templates", () => ({
  listTemplates: (...args: unknown[]) => listTemplatesMock(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ db: {} }));

describe("useTemplates", () => {
  it("returns templates from one-shot fetch", async () => {
    const sample: OwnershipTemplate[] = [
      { id: "a", label: "Sat", napOwners: ["Jake"], wakeWindowOwners: ["Kelly"] },
    ];
    listTemplatesMock.mockResolvedValue(sample);
    const { result } = renderHook(() => useTemplates("child-1"));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.templates).toEqual(sample);
    });
  });
});
```

- [ ] **Step 5: Implement `src/hooks/useTemplates.ts`**

```ts
"use client";

import { useEffect, useState } from "react";
import type { OwnershipTemplate } from "@/domain";
import { db } from "@/lib/firebase/client";
import { listTemplates } from "@/repositories/templates";

export type UseTemplatesResult = {
  templates: OwnershipTemplate[];
  loading: boolean;
};

export function useTemplates(childId: string): UseTemplatesResult {
  const [templates, setTemplates] = useState<OwnershipTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listTemplates(db, childId).then((t) => {
      if (!cancelled) {
        setTemplates(t);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  return { templates, loading };
}
```

- [ ] **Step 6: Run — 1 passed. Commit.**

```bash
git add src/hooks/useTemplates.ts src/hooks/useTemplates.test.tsx
git commit -m "feat(hooks): useTemplates one-shot fetch"
```

---

## Task B11: Sync status hook

**Files:**
- Create: `src/hooks/useSyncStatus.ts`, `src/hooks/useSyncStatus.test.tsx`

The hook reports `online: boolean` (from `navigator.onLine` + Firestore `onSnapshotsInSync`) and `lastSyncedAt: number | null` (timestamp of the most recent successful snapshot).

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSyncStatus } from "./useSyncStatus";

const onSnapshotsInSyncMock = vi.fn();
vi.mock("firebase/firestore", () => ({
  onSnapshotsInSync: (...args: unknown[]) => onSnapshotsInSyncMock(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ db: {} }));

describe("useSyncStatus", () => {
  it("starts online based on navigator and updates lastSyncedAt on each in-sync event", () => {
    let triggerInSync: (() => void) | undefined;
    onSnapshotsInSyncMock.mockImplementation((_db, cb) => {
      triggerInSync = cb;
      return () => {};
    });

    const { result } = renderHook(() => useSyncStatus());
    expect(result.current.online).toBe(navigator.onLine);
    expect(result.current.lastSyncedAt).toBeNull();

    act(() => {
      triggerInSync!();
    });
    expect(result.current.lastSyncedAt).not.toBeNull();
  });

  it("reflects offline event", () => {
    onSnapshotsInSyncMock.mockImplementation(() => () => {});
    const { result } = renderHook(() => useSyncStatus());
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.online).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `src/hooks/useSyncStatus.ts`**

```ts
"use client";

import { useEffect, useState } from "react";
import { onSnapshotsInSync } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type UseSyncStatusResult = {
  online: boolean;
  lastSyncedAt: number | null;
};

export function useSyncStatus(): UseSyncStatusResult {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const unsub = onSnapshotsInSync(db, () => setLastSyncedAt(Date.now()));
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsub();
    };
  }, []);

  return { online, lastSyncedAt };
}
```

- [ ] **Step 3: Run — 2 passed. Commit.**

```bash
git add src/hooks/useSyncStatus.ts src/hooks/useSyncStatus.test.tsx
git commit -m "feat(hooks): useSyncStatus with online + lastSyncedAt indicators"
```

---

## Task B12: Start New Day mutation

**Files:**
- Create: `src/repositories/startNewDay.ts`, `src/repositories/startNewDay.test.ts`

PRD §Start New Day:
1. Archive current active day.
2. Preserve actual bottles, naps, pump events, owners, and extra events from prior day **as historical records on that archived day** (no copy needed; they stay where they are).
3. Create new active day.
4. Carry forward settings (settings is a singleton — nothing to copy).
5. Apply day-of-week ownership template if Saturday/Sunday.
6. Clear actuals (the new day starts empty).
7. Ask for wake time (caller passes it in).
8. Keep Bottle 1 pending until started/entered.

This translates to: archive the active day, then create a new day with the given date, wakeTime, and templateId.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { startTestEnv, ALLOWED_USER } from "../../tests/integration/firestore-test-utils";
import { createDay, getDay, getDayByDate } from "./days";
import { startNewDay } from "./startNewDay";
import type { Day } from "@/domain";

const baseDay = (overrides: Partial<Day>): Day => ({
  id: "day-prev",
  childId: "child-1",
  date: "2026-05-04",
  status: "active",
  wakeTime: "07:00",
  createdAt: "2026-05-04T07:00:00Z",
  ...overrides,
});

describe("startNewDay", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await startTestEnv();
  });
  afterAll(async () => {
    await env.cleanup();
  });
  beforeEach(async () => {
    await env.clearFirestore();
  });

  it("archives current active day and creates a new active day", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore();
    await createDay(db, baseDay({}));

    const result = await startNewDay(db, "child-1", {
      newDayId: "day-new",
      newDate: "2026-05-05",
      newWakeTime: "07:15",
      ownershipTemplateId: "tmpl-sunday",
      now: "2026-05-05T07:15:00Z",
    });

    expect(result.archivedDayId).toBe("day-prev");
    expect(result.newDayId).toBe("day-new");

    const archived = await getDay(db, "child-1", "day-prev");
    expect(archived?.status).toBe("archived");
    expect(archived?.archivedAt).toBe("2026-05-05T07:15:00Z");

    const created = await getDayByDate(db, "child-1", "2026-05-05");
    expect(created?.status).toBe("active");
    expect(created?.wakeTime).toBe("07:15");
    expect(created?.ownershipTemplateId).toBe("tmpl-sunday");
  });

  it("creates a new active day with no prior day to archive", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore();

    const result = await startNewDay(db, "child-1", {
      newDayId: "day-new",
      newDate: "2026-05-05",
      newWakeTime: "07:00",
      now: "2026-05-05T07:00:00Z",
    });

    expect(result.archivedDayId).toBeNull();
    const created = await getDayByDate(db, "child-1", "2026-05-05");
    expect(created?.status).toBe("active");
  });
});
```

- [ ] **Step 2: Implement `src/repositories/startNewDay.ts`**

```ts
import {
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  where,
  type Firestore,
} from "firebase/firestore";
import type { Day } from "@/domain";
import { dayConverter } from "@/lib/firestore/converters";
import { dayPath, daysCollectionPath } from "@/lib/firestore/paths";
import { collection } from "firebase/firestore";

export type StartNewDayInput = {
  newDayId: string;
  newDate: string;          // "YYYY-MM-DD"
  newWakeTime: string;      // "HH:MM"
  ownershipTemplateId?: string;
  now: string;              // ISO timestamp for archivedAt and createdAt
};

export type StartNewDayResult = {
  archivedDayId: string | null;
  newDayId: string;
};

export async function startNewDay(
  db: Firestore,
  childId: string,
  input: StartNewDayInput,
): Promise<StartNewDayResult> {
  const daysRef = collection(db, daysCollectionPath(childId)).withConverter(dayConverter);
  const activeQuery = query(daysRef, where("status", "==", "active"), limit(1));
  const activeSnap = await getDocs(activeQuery);
  const activeDoc = activeSnap.empty ? null : activeSnap.docs[0]!;

  return runTransaction(db, async (tx) => {
    if (activeDoc) {
      tx.update(activeDoc.ref, { status: "archived", archivedAt: input.now });
    }
    const newDay: Day = {
      id: input.newDayId,
      childId,
      date: input.newDate,
      status: "active",
      wakeTime: input.newWakeTime,
      createdAt: input.now,
      ...(input.ownershipTemplateId ? { ownershipTemplateId: input.ownershipTemplateId } : {}),
    };
    tx.set(doc(db, dayPath(childId, input.newDayId)).withConverter(dayConverter), newDay);
    return {
      archivedDayId: activeDoc?.id ?? null,
      newDayId: input.newDayId,
    };
  });
}
```

- [ ] **Step 3: Run with emulator — 2 passed. Commit.**

```bash
git add src/repositories/startNewDay.ts src/repositories/startNewDay.test.ts
git commit -m "feat(repo): startNewDay archives active day and creates new one in a transaction"
```

---

## Task B13: Security rules + emulator rule tests

**Files:**
- Modify: `firestore.rules`
- Create: `tests/integration/rules.test.ts`

The rules enforce that only allowlisted emails can read or write under any `children/*` document, and that documents conform to expected shapes (light validation).

- [ ] **Step 1: Replace `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAllowlisted() {
      return request.auth != null && request.auth.token.email in [
        "jake136@yahoo.com"
        // Add Kelly's email here when ready, then update src/lib/auth/allowlist.ts in lockstep.
      ];
    }

    function isString(value) {
      return value is string && value.size() > 0;
    }

    match /children/{childId} {
      allow read, write: if isAllowlisted();

      match /settings/current {
        allow read: if isAllowlisted();
        allow write: if isAllowlisted()
          && request.resource.data.childId == childId;
      }

      match /days/{dayId} {
        allow read: if isAllowlisted();
        allow create: if isAllowlisted()
          && request.resource.data.childId == childId
          && request.resource.data.id == dayId
          && isString(request.resource.data.date)
          && request.resource.data.status in ["planned", "active", "archived"];
        allow update, delete: if isAllowlisted();

        match /events/{eventId} {
          allow read: if isAllowlisted();
          allow create: if isAllowlisted()
            && request.resource.data.dayId == dayId
            && request.resource.data.id == eventId
            && isString(request.resource.data.startTime);
          allow update, delete: if isAllowlisted();
        }
      }

      match /templates/{templateId} {
        allow read, write: if isAllowlisted();
      }
    }
  }
}
```

- [ ] **Step 2: Write `tests/integration/rules.test.ts`**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  startTestEnv,
  ALLOWED_USER,
  FORBIDDEN_USER,
} from "./firestore-test-utils";

describe("Firestore security rules", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await startTestEnv();
  });
  afterAll(async () => {
    await env.cleanup();
  });
  beforeEach(async () => {
    await env.clearFirestore();
  });

  it("denies reads to unauthenticated users", async () => {
    const ctx = env.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), "children/c1/settings/current")));
  });

  it("denies reads to non-allowlisted users", async () => {
    const ctx = env.authenticatedContext(FORBIDDEN_USER.uid, { email: FORBIDDEN_USER.email });
    await assertFails(getDoc(doc(ctx.firestore(), "children/c1/settings/current")));
  });

  it("permits reads to allowlisted users", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    await assertSucceeds(getDoc(doc(ctx.firestore(), "children/c1/settings/current")));
  });

  it("denies day create with mismatched childId", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    await assertFails(
      setDoc(doc(ctx.firestore(), "children/c1/days/d1"), {
        id: "d1",
        childId: "OTHER",
        date: "2026-05-05",
        status: "active",
        createdAt: "2026-05-05T07:00:00Z",
      }),
    );
  });

  it("permits day create with correct shape", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), "children/c1/days/d1"), {
        id: "d1",
        childId: "c1",
        date: "2026-05-05",
        status: "active",
        createdAt: "2026-05-05T07:00:00Z",
      }),
    );
  });
});
```

- [ ] **Step 3: Run with emulator — 5 passed. Commit.**

```bash
git add firestore.rules tests/integration/rules.test.ts
git commit -m "feat(rules): email allowlist + shape validation; emulator rule tests"
```

---

## Task B14: Full lifecycle integration test

**Files:**
- Create: `tests/integration/dayLifecycle.test.ts`
- Modify: `package.json` (add `test:integration` script)

This test exercises the full pipeline: settings save → day create → events create/update/delete → archive → new day. It catches integration bugs that per-repo tests miss.

- [ ] **Step 1: Add script to `package.json`**

Add to the `"scripts"` block:

```json
"test:integration": "vitest run --testNamePattern '.' src/repositories tests/integration"
```

(All repositories AND integration tests live under these two paths and require the emulator.)

- [ ] **Step 2: Write `tests/integration/dayLifecycle.test.ts`**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { startTestEnv, ALLOWED_USER } from "./firestore-test-utils";
import { saveSettings } from "@/repositories/settings";
import { createDay, getDayByDate } from "@/repositories/days";
import { createEvent, listEvents } from "@/repositories/events";
import { startNewDay } from "@/repositories/startNewDay";
import { sampleSettings } from "@/domain/__fixtures__/sample";
import type { Event } from "@/domain";

describe("full day lifecycle", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await startTestEnv();
  });
  afterAll(async () => {
    await env.cleanup();
  });
  beforeEach(async () => {
    await env.clearFirestore();
  });

  it("seeds settings, runs a day, and rolls over to the next", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore();

    // 1. Seed settings
    await saveSettings(db, "child-1", sampleSettings);

    // 2. Create today's day
    await createDay(db, {
      id: "day-today",
      childId: "child-1",
      date: "2026-05-05",
      status: "active",
      wakeTime: "07:00",
      createdAt: "2026-05-05T07:00:00Z",
    });

    // 3. Log Bottle 1 actual + Nap 1 actual
    const bottle1: Event = {
      id: "ev-bottle-1",
      dayId: "day-today",
      eventKey: "bottle_1",
      type: "bottle",
      label: "Bottle 1",
      startTime: "07:05",
      amountOz: 5,
      source: "actual",
      status: "actual",
    };
    const nap1: Event = {
      id: "ev-nap-1",
      dayId: "day-today",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:10",
      endTime: "10:15",
      source: "actual",
      status: "actual",
    };
    await createEvent(db, "child-1", bottle1);
    await createEvent(db, "child-1", nap1);

    const events = await listEvents(db, "child-1", "day-today");
    expect(events).toHaveLength(2);

    // 4. Roll over to tomorrow
    const result = await startNewDay(db, "child-1", {
      newDayId: "day-tomorrow",
      newDate: "2026-05-06",
      newWakeTime: "07:00",
      now: "2026-05-06T07:00:00Z",
    });
    expect(result.archivedDayId).toBe("day-today");

    // 5. New day is empty
    const tomorrow = await getDayByDate(db, "child-1", "2026-05-06");
    expect(tomorrow?.status).toBe("active");
    const tomorrowEvents = await listEvents(db, "child-1", "day-tomorrow");
    expect(tomorrowEvents).toHaveLength(0);

    // 6. Yesterday's events are still on yesterday (preserved)
    const yesterdayEvents = await listEvents(db, "child-1", "day-today");
    expect(yesterdayEvents).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run with emulator — 1 passed**

```bash
firebase emulators:start --only firestore --project baby-day-planner-test
# In another terminal:
pnpm test:integration
```

Expected: all repository tests + the lifecycle test pass.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/dayLifecycle.test.ts package.json
git commit -m "test(integration): full day lifecycle on Firestore emulator"
```

---

## Done when

- 14 tasks complete; all commits on `feat/data-layer` branch (or whatever branch you use).
- `pnpm test` passes (unit tests with mocked repositories — runnable without emulator).
- `pnpm test:integration` passes with the Firestore emulator running.
- `firestore.rules` enforces email allowlist + shape validation.
- `AuthProvider` gates the UI on allowlisted emails.
- All hooks (`useSettings`, `useDay`, `useEvents`, `useTemplates`, `useSyncStatus`) consumable from any client component.
- `startNewDay` correctly archives + creates in a transaction.

## Out of scope (deferred to Plan C — frontend)

- Any UI screens (Dashboard, Timeline, Edit, Tomorrow, History, Settings).
- PWA manifest + service worker for offline.
- Deployment (Vercel vs Firebase App Hosting).
- Tomorrow Plan UI + the "promote tomorrow → today" flow (the `startNewDay` building block exists; UI logic lives in Plan C).
- Analytics, charts, push notifications (explicit non-goals per PRD).

## Operational notes

- **Adding a third user:** edit the array in BOTH `src/lib/auth/allowlist.ts` AND `firestore.rules`. They must stay in lockstep — if rules permit but allowlist denies, user gets a "forbidden" screen with valid Firestore access; if allowlist permits but rules deny, user gets the UI but every read/write fails.
- **Email case sensitivity:** Firestore rules compare emails as-stored. Google sign-in normalizes to lowercase. The allowlist entries should be lowercase to match. The client allowlist also lowercases for comparison.
- **Composite indexes:** `events` ordered by `startTime` may need a single-field index — Firestore auto-creates this on first query. Watch the emulator UI / production console for prompts to create composite indexes if you add `where` + `orderBy` combinations later.
- **Offline-first:** Firestore caches by default. `useSyncStatus` reflects online state but reads/writes still resolve from cache when offline; mutations queue and flush on reconnect.
