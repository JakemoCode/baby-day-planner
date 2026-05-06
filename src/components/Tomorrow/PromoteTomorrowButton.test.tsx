import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, userEvent, within } from "@/test-utils";
import { PromoteTomorrowButton } from "./PromoteTomorrowButton";

describe("PromoteTomorrowButton", () => {
  it("renders 'Promote to today' label", () => {
    renderWithAuth(<PromoteTomorrowButton onPromote={() => {}} />);
    expect(screen.getByRole("button", { name: /promote to today/i })).toBeInTheDocument();
  });

  it("opens a confirm dialog when tapped", async () => {
    renderWithAuth(<PromoteTomorrowButton onPromote={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /promote to today/i }));
    expect(
      screen.getByRole("dialog", { name: /promote.*today|archive today/i }),
    ).toBeInTheDocument();
  });

  it("calls onPromote when confirmed", async () => {
    const onPromote = vi.fn();
    renderWithAuth(<PromoteTomorrowButton onPromote={onPromote} />);
    await userEvent.click(screen.getByRole("button", { name: /promote to today/i }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /promote|start/i }));
    expect(onPromote).toHaveBeenCalledTimes(1);
  });

  it("does not call onPromote when cancelled", async () => {
    const onPromote = vi.fn();
    renderWithAuth(<PromoteTomorrowButton onPromote={onPromote} />);
    await userEvent.click(screen.getByRole("button", { name: /promote to today/i }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /cancel|keep/i }));
    expect(onPromote).not.toHaveBeenCalled();
  });

  it("can be disabled (e.g. when plan is incomplete)", () => {
    renderWithAuth(<PromoteTomorrowButton onPromote={() => {}} disabled />);
    expect(screen.getByRole("button", { name: /promote to today/i })).toBeDisabled();
  });
});
