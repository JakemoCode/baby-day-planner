import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignIn } from "./SignIn";

const signInMock = vi.fn().mockResolvedValue(undefined);
const useAuthMock = vi.fn();
vi.mock("./useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn() }),
}));

describe("SignIn", () => {
  beforeEach(() => {
    signInMock.mockClear();
    replaceMock.mockClear();
    useAuthMock.mockReturnValue({
      signIn: signInMock,
      status: "signed_out",
      user: null,
      signOut: vi.fn(),
    });
  });

  it("renders a Google sign-in button", () => {
    render(<SignIn />);
    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeVisible();
  });

  it("invokes signIn when clicked", async () => {
    render(<SignIn />);
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(signInMock).toHaveBeenCalledTimes(1);
  });

  it("redirects to / when status becomes authorized", () => {
    useAuthMock.mockReturnValue({
      signIn: signInMock,
      status: "authorized",
      user: { email: "jake136@yahoo.com" },
      signOut: vi.fn(),
    });
    render(<SignIn />);
    expect(replaceMock).toHaveBeenCalledWith("/");
  });

  it("does not redirect when status is signed_out", () => {
    render(<SignIn />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does not redirect when status is forbidden", () => {
    useAuthMock.mockReturnValue({
      signIn: signInMock,
      status: "forbidden",
      user: { email: "stranger@example.com" },
      signOut: vi.fn(),
    });
    render(<SignIn />);
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
