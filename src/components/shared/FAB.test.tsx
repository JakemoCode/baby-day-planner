import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import { FAB } from "./FAB";

describe("FAB", () => {
  it("renders an accessible button with the given label", () => {
    renderWithAuth(<FAB label="Add extra event" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: /add extra event/i })).toBeInTheDocument();
  });

  it("invokes onClick when tapped", async () => {
    const onClick = vi.fn();
    renderWithAuth(<FAB label="Add" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
