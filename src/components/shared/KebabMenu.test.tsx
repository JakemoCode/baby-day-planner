import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import { KebabMenu } from "./KebabMenu";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("KebabMenu", () => {
  it("renders a menu trigger button", () => {
    renderWithAuth(<KebabMenu />);
    expect(screen.getByRole("button", { name: /more options/i })).toBeVisible();
  });

  // Settings moved to BottomTabs as a 4th primary destination (2026-05-20);
  // the kebab keeps History + Day templates (lower-frequency browse/config)
  // plus Sign out.
  it("opens a menu with History, Day templates, and Sign out when clicked", async () => {
    renderWithAuth(<KebabMenu />);
    await userEvent.click(screen.getByRole("button", { name: /more options/i }));
    expect(screen.getByRole("menuitem", { name: /history/i })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /day templates/i })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: /^settings$/i })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeVisible();
  });

  it("invokes signOut when Sign out is clicked", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    renderWithAuth(<KebabMenu />, { auth: { signOut } });
    await userEvent.click(screen.getByRole("button", { name: /more options/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("closes the menu after selecting an item", async () => {
    renderWithAuth(<KebabMenu />);
    await userEvent.click(screen.getByRole("button", { name: /more options/i }));
    expect(screen.getByRole("menuitem", { name: /history/i })).toBeVisible();
    await userEvent.click(screen.getByRole("menuitem", { name: /history/i }));
    expect(screen.queryByRole("menuitem", { name: /history/i })).toBeNull();
  });
});
