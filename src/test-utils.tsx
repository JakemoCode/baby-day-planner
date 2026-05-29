/*
 * Shared test utilities. `renderWithAuth` wraps components in a mocked
 * AuthProvider + ChildProvider. Mock Firestore hooks per-test via vi.mock.
 */

import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { expect, vi } from "vitest";
import { configureAxe } from "jest-axe";
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

/**
 * Project-configured axe runner for component a11y tests.
 *
 * Only `color-contrast` is disabled: jsdom has no layout engine or canvas, so
 * the rule cannot measure real contrast and produces only noise. Visual
 * contrast is covered by the browser-driven `/design-audit` flow. (Other
 * geometry-dependent rules like `target-size` aren't in the default tag set
 * jest-axe runs, so they don't fire here.)
 */
export const axe = configureAxe({
  rules: {
    "color-contrast": { enabled: false },
  },
});

/**
 * Render `ui` with the standard Auth + Child providers and assert axe finds no
 * structural a11y violations. One-liner for the common case; for components
 * that need data-hook mocks, set those up first then call this.
 */
export async function expectNoA11yViolations(
  ui: ReactElement,
  options?: RenderWithAuthOptions,
): Promise<void> {
  const { container } = renderWithAuth(ui, options);
  expect(await axe(container)).toHaveNoViolations();
}

// Re-export common testing utilities so component tests have one import.
export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
