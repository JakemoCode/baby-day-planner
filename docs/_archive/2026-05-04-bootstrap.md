# Baby Day Planner — Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Next.js + TypeScript + Firebase scaffold with Vitest, Playwright, CSS Modules, and CI in place — so subsequent plans (scheduling engine, data layer, frontend) can start with TDD on green.

**Architecture:** Next.js 16 App Router for the web app, TypeScript strict, CSS Modules + `tokens.css` for styling, Firebase (Firestore + Auth) as the backend BaaS via the Firebase emulator suite for local dev. Vitest + React Testing Library for unit/integration tests; Playwright for E2E. GitHub Actions CI runs typecheck + lint + Vitest on every PR. Hosting decision (Vercel vs. Firebase App Hosting) is **deferred** to a later plan — bootstrap is hosting-agnostic.

**Tech Stack:**
- Next.js 16 (App Router), React 19, TypeScript 5.6+ (strict)
- CSS Modules + CSS custom properties (no Tailwind, no runtime CSS-in-JS)
- Firebase JS SDK 11+ (Auth + Firestore client), Firebase Admin SDK for server
- Firebase Local Emulator Suite (Auth + Firestore)
- Vitest 2+, @testing-library/react, @testing-library/user-event, jsdom
- Playwright 1.48+
- ESLint (next/core-web-vitals + @typescript-eslint), Prettier
- pnpm (lockfile committed)

---

## File Structure

Files created during this plan:

- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `.eslintrc.json`, `.prettierrc`, `.gitignore`, `.nvmrc`
- `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- `src/styles/tokens.css`
- `src/lib/firebase/client.ts`, `src/lib/firebase/admin.ts`
- `src/lib/auth/AuthProvider.tsx`
- `src/domain/.gitkeep` (placeholder; populated by scheduling-engine plan)
- `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.firebaserc`
- `.env.local.example`
- `tests/smoke/home.test.tsx`
- `tests/e2e/home.spec.ts`
- `.github/workflows/ci.yml`
- `README.md`

---

## Task 1: Initialize Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`, `next-env.d.ts`

- [ ] **Step 1: Run create-next-app with non-interactive flags**

Run from `/Users/jakemosher/Workspace/baby-day-planner`:

```bash
pnpm create next-app@latest . --typescript --eslint --app --src-dir --no-tailwind --import-alias "@/*" --use-pnpm --turbopack
```

Expected: scaffolder writes `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/{layout,page}.tsx`, `src/app/globals.css`, `.eslintrc.json`, `.gitignore`. May prompt to overwrite the existing empty git repo's files — accept.

- [ ] **Step 2: Verify dev server boots and the page renders**

```bash
pnpm dev
```

Expected: server logs `Ready in <Nms>` on `http://localhost:3000`. Hit the URL, see the default Next welcome. Stop with Ctrl+C.

- [ ] **Step 3: Pin Node version and add engines field**

Create `.nvmrc`:

```
22
```

Edit `package.json` to add an `engines` block under the top-level object:

```json
"engines": {
  "node": ">=22.0.0",
  "pnpm": ">=9.0.0"
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with App Router, TS, ESLint, src dir"
```

---

## Task 2: Tighten TypeScript config

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Replace tsconfig.json with strict settings**

Overwrite `tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm exec tsc --noEmit
```

Expected: exits 0 with no output.

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: enable strict TS, noUncheckedIndexedAccess, exactOptionalPropertyTypes"
```

---

## Task 3: Add design tokens and base styles

**Files:**
- Create: `src/styles/tokens.css`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1: Create `src/styles/tokens.css`**

```css
:root {
  /* Color */
  --color-bg: #ffffff;
  --color-fg: #111111;
  --color-muted: #6b6b6b;
  --color-border: #e3e3e3;
  --color-accent: #2c6ef2;
  --color-success: #1f8a3a;
  --color-warning: #c47f00;
  --color-danger: #c0392b;

  /* Owner colors */
  --color-owner-jake: #2c6ef2;
  --color-owner-kelly: #b14fb1;
  --color-owner-daycare: #6b6b6b;

  /* Spacing (4px base) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-8: 3rem;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;

  /* Type */
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.5rem;
  --text-2xl: 2rem;

  /* Shadow */
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.04);

  /* Layout */
  --content-max: 480px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #111111;
    --color-fg: #f5f5f5;
    --color-muted: #a0a0a0;
    --color-border: #2a2a2a;
  }
}
```

- [ ] **Step 2: Replace `src/app/globals.css`**

```css
@import "../styles/tokens.css";

*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}
button { font: inherit; cursor: pointer; }
a { color: var(--color-accent); }
```

- [ ] **Step 3: Replace `src/app/layout.tsx`**

```tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";

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
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Replace `src/app/page.tsx` with a minimal landing**

```tsx
export default function Home() {
  return (
    <main style={{ padding: "var(--space-4)" }}>
      <h1>Baby Day Planner</h1>
      <p>Bootstrap is alive.</p>
    </main>
  );
}
```

- [ ] **Step 5: Verify dev server still renders**

```bash
pnpm dev
```

Expected: visit `http://localhost:3000`, see "Baby Day Planner / Bootstrap is alive." Stop with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat(styles): add tokens.css, base globals, mobile-first viewport"
```

---

## Task 4: Set up Vitest + React Testing Library

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`, `tests/smoke/home.test.tsx`
- Modify: `package.json`

- [ ] **Step 1: Install test dependencies**

```bash
pnpm add -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react
```

Expected: pnpm installs and updates `package.json` + `pnpm-lock.yaml`.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/app/**", "src/**/types.ts"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Add test scripts to `package.json`**

Edit the `"scripts"` block in `package.json` to include:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui",
"test:coverage": "vitest run --coverage",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 5: Write a smoke test that fails first**

Create `tests/smoke/home.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "@/app/page";

describe("Home page", () => {
  it("renders the app title", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /baby day planner/i })).toBeInTheDocument();
  });

  it("declares a placeholder string the user has not yet written", () => {
    render(<Home />);
    expect(screen.getByText(/bootstrap is fully operational/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run tests to confirm second test fails**

```bash
pnpm test
```

Expected: first test PASSES, second test FAILS with "unable to find element with text /bootstrap is fully operational/i".

- [ ] **Step 7: Replace second test with a passing assertion that exercises real content**

Replace `tests/smoke/home.test.tsx` body for the second test:

```tsx
  it("renders the bootstrap status line", () => {
    render(<Home />);
    expect(screen.getByText(/bootstrap is alive/i)).toBeInTheDocument();
  });
```

- [ ] **Step 8: Run tests to confirm both pass**

```bash
pnpm test
```

Expected: 2 passed, 0 failed.

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts vitest.setup.ts package.json pnpm-lock.yaml tests/
git commit -m "test: configure Vitest + RTL with smoke test on home page"
```

---

## Task 5: Set up Playwright for E2E

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/home.spec.ts`
- Modify: `package.json`, `.gitignore`

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

Expected: dependency added; chromium browser installed under `~/Library/Caches/ms-playwright`.

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "iphone-13",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Add `test:e2e` script to `package.json`**

Inside `"scripts"`:

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 4: Append Playwright artifacts to `.gitignore`**

Add these lines to `.gitignore`:

```
/test-results/
/playwright-report/
/playwright/.cache/
```

- [ ] **Step 5: Write failing E2E spec**

Create `tests/e2e/home.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("home page shows app title and bootstrap status", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /baby day planner/i })).toBeVisible();
  await expect(page.getByText(/bootstrap is alive/i)).toBeVisible();
});
```

- [ ] **Step 6: Run E2E to confirm pass**

```bash
pnpm test:e2e
```

Expected: 2 projects (iphone-13, desktop-chrome) × 1 test each = 2 passed.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts tests/e2e/ package.json pnpm-lock.yaml .gitignore
git commit -m "test: configure Playwright with iPhone 13 + desktop Chrome projects"
```

---

## Task 6: Configure ESLint + Prettier

**Files:**
- Modify: `.eslintrc.json`, `package.json`
- Create: `.prettierrc`, `.prettierignore`

- [ ] **Step 1: Install Prettier**

```bash
pnpm add -D prettier eslint-config-prettier
```

- [ ] **Step 2: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
.next/
node_modules/
pnpm-lock.yaml
coverage/
test-results/
playwright-report/
*.md
```

- [ ] **Step 4: Replace `.eslintrc.json`**

```json
{
  "extends": ["next/core-web-vitals", "next/typescript", "prettier"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    "@typescript-eslint/consistent-type-imports": ["error", { "prefer": "type-imports" }]
  }
}
```

- [ ] **Step 5: Add lint + format scripts to `package.json`**

```json
"lint": "next lint",
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 6: Run lint + format**

```bash
pnpm lint && pnpm format
```

Expected: no lint errors; Prettier formats files (probably none changed).

- [ ] **Step 7: Commit**

```bash
git add .eslintrc.json .prettierrc .prettierignore package.json pnpm-lock.yaml
git commit -m "chore: add Prettier and tighten ESLint rules"
```

---

## Task 7: Initialize Firebase project and emulators

**Files:**
- Create: `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.firebaserc`, `.env.local.example`
- Modify: `.gitignore`

- [ ] **Step 1: Install Firebase CLI globally if not present**

```bash
firebase --version || npm i -g firebase-tools
```

Expected: prints version (e.g., `13.x.x`).

- [ ] **Step 2: Create the Firebase project (manual, requires browser auth)**

Run **interactively** (this prompts a browser login):

```bash
firebase login
firebase projects:create baby-day-planner-jake
```

Expected: project created. If the project ID is taken, append a suffix (e.g., `-2`); record the actual ID for `.firebaserc`.

> **If running in CI/non-interactive:** skip this step and use an existing project; set `--project` on subsequent firebase commands.

- [ ] **Step 3: Create `.firebaserc`**

Replace `<PROJECT_ID>` with the actual ID from Step 2:

```json
{
  "projects": {
    "default": "<PROJECT_ID>"
  }
}
```

- [ ] **Step 4: Create `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 5: Create `firestore.rules` (locked-down default)**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

> Real allowlist rules ship in the data-layer plan; this default denies everything until then.

- [ ] **Step 6: Create `firestore.indexes.json`**

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

- [ ] **Step 7: Create `.env.local.example`**

```
# Firebase web config (safe to commit values from Firebase console > Project Settings > Web app)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Set to "1" to wire client SDK to local emulators
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1
```

- [ ] **Step 8: Append `.env.local` to `.gitignore`**

Add this line to `.gitignore`:

```
.env.local
```

- [ ] **Step 9: Boot emulators to verify config**

```bash
firebase emulators:start --only auth,firestore
```

Expected: terminal shows "All emulators ready", Auth on `:9099`, Firestore on `:8080`, UI on `:4000`. Visit `http://localhost:4000` to confirm UI loads. Stop with Ctrl+C.

- [ ] **Step 10: Commit**

```bash
git add firebase.json firestore.rules firestore.indexes.json .firebaserc .env.local.example .gitignore
git commit -m "chore(firebase): scaffold Firestore rules, emulator config, env template"
```

---

## Task 8: Wire Firebase client SDK

**Files:**
- Create: `src/lib/firebase/client.ts`, `src/lib/firebase/client.test.ts`

- [ ] **Step 1: Install Firebase SDK**

```bash
pnpm add firebase
```

- [ ] **Step 2: Write failing test for client config validation**

Create `src/lib/firebase/client.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("firebase client config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws when required env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    await expect(import("./client")).rejects.toThrow(/firebase env/i);
  });

  it("constructs a client when env vars are present", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "test.firebaseapp.com");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "test-project");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "0");
    const mod = await import("./client");
    expect(mod.firebaseApp).toBeDefined();
    expect(mod.auth).toBeDefined();
    expect(mod.db).toBeDefined();
  });
});
```

- [ ] **Step 3: Run the test to confirm failure**

```bash
pnpm test src/lib/firebase/client.test.ts
```

Expected: FAIL — module `./client` does not exist.

- [ ] **Step 4: Implement `src/lib/firebase/client.ts`**

```ts
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing Firebase env var: ${name}`);
  }
  return value;
}

const config = {
  apiKey: requireEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: requireEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: requireEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  appId: requireEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
};

export const firebaseApp: FirebaseApp = getApps()[0] ?? initializeApp(config);
export const auth: Auth = getAuth(firebaseApp);
export const db: Firestore = getFirestore(firebaseApp);

if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "1" && typeof window !== "undefined") {
  // Idempotent: emulator helpers throw if called twice; guard with a global flag.
  const w = window as unknown as { __firebaseEmulatorsConnected?: boolean };
  if (!w.__firebaseEmulatorsConnected) {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
    w.__firebaseEmulatorsConnected = true;
  }
}
```

- [ ] **Step 5: Run the test to confirm pass**

```bash
pnpm test src/lib/firebase/client.test.ts
```

Expected: 2 passed.

- [ ] **Step 6: Verify typecheck still clean**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/firebase/ package.json pnpm-lock.yaml
git commit -m "feat(firebase): client SDK with env validation and emulator wiring"
```

---

## Task 9: Add domain folder placeholder

**Files:**
- Create: `src/domain/.gitkeep`, `src/domain/README.md`

- [ ] **Step 1: Create the placeholder directory**

```bash
mkdir -p src/domain
touch src/domain/.gitkeep
```

- [ ] **Step 2: Create `src/domain/README.md`**

```markdown
# domain/

Pure TypeScript scheduling engine for the Baby Day Planner.

This module is the source of truth for projecting a day from settings + recorded actuals. It has **no React, no Firebase, no DOM dependencies** — just functions over plain data.

Populated by the `2026-05-04-scheduling-engine.md` plan.
```

- [ ] **Step 3: Commit**

```bash
git add src/domain/
git commit -m "chore(domain): create placeholder directory for scheduling engine"
```

---

## Task 10: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Format check
        run: pnpm format:check

      - name: Unit tests
        run: pnpm test
        env:
          NEXT_PUBLIC_FIREBASE_API_KEY: test-key
          NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: test.firebaseapp.com
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: test-project
          NEXT_PUBLIC_FIREBASE_APP_ID: 1:123:web:abc
          NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "0"

      - name: Build
        run: pnpm build
        env:
          NEXT_PUBLIC_FIREBASE_API_KEY: test-key
          NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: test.firebaseapp.com
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: test-project
          NEXT_PUBLIC_FIREBASE_APP_ID: 1:123:web:abc
          NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "0"
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "ci: typecheck, lint, format, vitest, build on PR"
```

---

## Task 11: Project README

**Files:**
- Create/modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# Baby Day Planner

Private, mobile-first PWA for projecting and managing the day's baby schedule for bottles, naps, wake windows, pumping, and owner assignments. Two users (Jake + Kelly), Firebase backend, realtime sync.

> What happens next, and how did the latest bottle/nap change the rest of today?

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript (strict)
- CSS Modules + `tokens.css`
- Firebase (Firestore + Auth)
- Vitest + React Testing Library, Playwright (E2E)

## Local development

```bash
pnpm install
cp .env.local.example .env.local   # fill in values from Firebase console
pnpm dev                            # Next.js on :3000
firebase emulators:start            # Firestore :8080, Auth :9099, UI :4000 (separate terminal)
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server with Turbopack |
| `pnpm build` | Production build |
| `pnpm test` | Vitest unit/integration tests |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |

## Plans

- [`docs/2026-05-04-bootstrap.md`](docs/2026-05-04-bootstrap.md) — this plan
- [`docs/2026-05-04-scheduling-engine.md`](docs/2026-05-04-scheduling-engine.md) — pure TS scheduling domain

## PRD

`/Users/jakemosher/Workspace/docs/private_baby_day_planner_v1_prd.md`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: project README with stack, scripts, links"
```

---

## Task 12: Final verification

- [ ] **Step 1: Clean install from lockfile**

```bash
rm -rf node_modules
pnpm install --frozen-lockfile
```

Expected: install succeeds, lockfile unchanged.

- [ ] **Step 2: Run the full local CI pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: every step exits 0. Build emits `.next/` output.

- [ ] **Step 3: Confirm git status is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`.

- [ ] **Step 4: Push to remote (optional, only if remote is configured)**

```bash
git remote -v && git push -u origin main
```

If no remote is configured yet, skip — first PR will set it up.

---

## Done when

- `pnpm dev` serves the app locally with the Bootstrap heading.
- `pnpm test` and `pnpm test:e2e` both pass.
- `pnpm build` succeeds.
- Firebase emulators boot via `firebase emulators:start`.
- CI workflow file exists and is committed.
- `src/domain/` exists and is empty (ready for the scheduling-engine plan).
- README points to both plan documents.
