import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import { SettingsAccount } from "./SettingsAccount";

describe("SettingsAccount", () => {
  it("displays the signed-in user's email", () => {
    renderWithAuth(<SettingsAccount />);
    expect(screen.getByText(/jake136@yahoo\.com/i)).toBeVisible();
  });

  it("renders a Sign out button", () => {
    renderWithAuth(<SettingsAccount />);
    expect(screen.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  it("invokes signOut when the button is tapped", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    renderWithAuth(<SettingsAccount />, { auth: { signOut } });
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("shows fallback when no email is available", () => {
    renderWithAuth(<SettingsAccount />, {
      auth: { user: null, status: "authorized" },
    });
    expect(screen.getByText(/not signed in/i)).toBeVisible();
  });
});
