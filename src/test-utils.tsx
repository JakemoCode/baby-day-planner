/*
 * Shared test utilities. `renderWithAuth` wraps components in a mocked
 * AuthProvider + ChildProvider. Mock Firestore hooks per-test via vi.mock.
 */

import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import type { User } from "firebase/auth";
import { AuthContext, type AuthContextValue } from "@/lib/auth/AuthProvider";
import { ChildProvider } from "@/v3/context/ChildProvider";
import type { Child } from "@/v3/schemas";

export const TEST_CHILD: Child = {
  id: "test-child-id",
  displayName: "Aden",
  dateOfBirth: "2025-04-10",
  createdAt: 1_700_000_000_000,
  createdBy: "test-uid-jake",
};

export function aChild(overrides: Partial<Child> = {}): Child {
  return { ...TEST_CHILD, ...overrides };
}

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
  /**
   * Child to expose via ChildProvider. Defaults to `TEST_CHILD`. Pass `null`
   * to omit the provider entirely (for components that don't need it, or
   * tests of the not-yet-onboarded path).
   */
  child?: Child | null;
};

export function renderWithAuth(
  ui: ReactElement,
  { auth, child = TEST_CHILD, ...renderOptions }: RenderWithAuthOptions = {},
): RenderResult & { authValue: AuthContextValue } {
  const authValue = makeAuthContext(auth);
  const result = render(ui, {
    wrapper: ({ children }) => (
      <MockAuthProvider value={authValue}>
        {child ? <ChildProvider child={child}>{children}</ChildProvider> : children}
      </MockAuthProvider>
    ),
    ...renderOptions,
  });
  return { ...result, authValue };
}

// Re-export common testing utilities so component tests have one import.
export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
