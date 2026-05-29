import "@testing-library/jest-dom/vitest";
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import { toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

// Default Firebase env vars so any test that transitively imports
// `@/lib/firebase/client` doesn't blow up at module-load time.
// Tests that need to validate env-var enforcement explicitly stub
// these via vi.stubEnv() in their own files.
process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??= "test-api-key";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??= "test.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= "baby-day-planner-test";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??= "1:000:web:test";
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS ??= "0";

afterEach(() => {
  cleanup();
});
