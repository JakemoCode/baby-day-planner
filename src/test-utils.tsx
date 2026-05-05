/*
 * Test utilities for component tests.
 *
 * Provides `renderWithAuth` that wraps the UI under test in a mocked
 * AuthProvider. Most components live under `(authed)` and call useAuth
 * indirectly through child components (Header, KebabMenu, SettingsAccount).
 *
 * Hooks that touch Firestore (`useDay`, `useEvents`, `useSettings`,
 * `useTemplates`, `useSyncStatus`) should be mocked per-test via
 * `vi.mock("@/hooks/...")`. Examples in any existing hook test file.
 *
 * Usage:
 *   import { renderWithAuth, screen } from "@/test-utils";
 *   renderWithAuth(<MyComponent />);
 *   renderWithAuth(<MyComponent />, { auth: { status: "forbidden" } });
 */

import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import type { User } from "firebase/auth";
import { AuthContext, type AuthContextValue } from "@/lib/auth/AuthProvider";

const DEFAULT_USER = {
  uid: "test-uid-jake",
  email: "jake136@yahoo.com",
  displayName: "Jake",
} as unknown as User;

export function makeAuthContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: DEFAULT_USER,
    status: "authorized",
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function MockAuthProvider({ value, children }: { value: AuthContextValue; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export type RenderWithAuthOptions = Omit<RenderOptions, "wrapper"> & {
  auth?: Partial<AuthContextValue>;
};

export function renderWithAuth(
  ui: ReactElement,
  { auth, ...renderOptions }: RenderWithAuthOptions = {},
): RenderResult & { authValue: AuthContextValue } {
  const authValue = makeAuthContext(auth);
  const result = render(ui, {
    wrapper: ({ children }) => <MockAuthProvider value={authValue}>{children}</MockAuthProvider>,
    ...renderOptions,
  });
  return { ...result, authValue };
}

// Re-export common testing utilities so component tests have one import.
export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
