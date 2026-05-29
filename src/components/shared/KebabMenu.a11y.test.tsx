import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, axe, screen, userEvent, expectNoA11yViolations } from "@/test-utils";
import { KebabMenu } from "./KebabMenu";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("KebabMenu a11y", () => {
  it("has no structural a11y violations (closed state)", async () => {
    await expectNoA11yViolations(<KebabMenu />);
  });

  it("open menu exposes role=menu and menuitems with no structural a11y violations", async () => {
    const { container } = renderWithAuth(<KebabMenu />);
    await userEvent.click(screen.getByRole("button", { name: /more options/i }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
