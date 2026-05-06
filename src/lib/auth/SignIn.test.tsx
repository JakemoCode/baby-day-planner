import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignIn } from "./SignIn";

const signInMock = vi.fn().mockResolvedValue(undefined);
vi.mock("./useAuth", () => ({
  useAuth: () => ({
    signIn: signInMock,
    status: "signed_out",
    user: null,
    signOut: vi.fn(),
  }),
}));

describe("SignIn", () => {
  it("renders a Google sign-in button", () => {
    render(<SignIn />);
    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeVisible();
  });

  it("invokes signIn when clicked", async () => {
    render(<SignIn />);
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(signInMock).toHaveBeenCalledTimes(1);
  });
});
