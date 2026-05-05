import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

vi.mock("@/lib/firebase/client", () => ({
  auth: { currentUser: null },
}));

const mockOnAuthStateChanged = vi.fn();
vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual("firebase/auth");
  return {
    ...actual,
    onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
    signOut: vi.fn().mockResolvedValue(undefined),
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
