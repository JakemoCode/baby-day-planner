import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StartDayButton } from "./StartDayButton";

describe("StartDayButton", () => {
  it("renders 'Start New Day' when no Tomorrow Plan exists", () => {
    render(<StartDayButton hasTomorrowPlan={false} onStart={async () => {}} />);
    expect(screen.getByRole("button", { name: /^start new day$/i })).toBeVisible();
  });

  it("renders 'Start Day from Plan' when a Tomorrow Plan exists", () => {
    render(<StartDayButton hasTomorrowPlan={true} onStart={async () => {}} />);
    expect(screen.getByRole("button", { name: /^start day from plan$/i })).toBeVisible();
  });

  it("calls onStart with useTomorrowPlan=false when confirmed without a plan", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<StartDayButton hasTomorrowPlan={false} onStart={onStart} />);
    await userEvent.click(screen.getByRole("button", { name: /^start new day$/i }));
    const dialog = screen.getByRole("dialog", { name: /archive today/i });
    await userEvent.click(within(dialog).getByRole("button", { name: /confirm|start/i }));
    expect(onStart).toHaveBeenCalledWith({ useTomorrowPlan: false });
  });

  it("calls onStart with useTomorrowPlan=true when confirming with a plan", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<StartDayButton hasTomorrowPlan={true} onStart={onStart} />);
    await userEvent.click(screen.getByRole("button", { name: /^start day from plan$/i }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /confirm|start/i }));
    expect(onStart).toHaveBeenCalledWith({ useTomorrowPlan: true });
  });

  it("does not call onStart when cancelled", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<StartDayButton hasTomorrowPlan={false} onStart={onStart} />);
    await userEvent.click(screen.getByRole("button", { name: /^start new day$/i }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /cancel|keep/i }));
    expect(onStart).not.toHaveBeenCalled();
  });

  it("'Start blank instead' overflow triggers useTomorrowPlan=false", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<StartDayButton hasTomorrowPlan={true} onStart={onStart} />);
    await userEvent.click(screen.getByRole("button", { name: /more.*start/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /start blank instead/i }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /confirm|start/i }));
    expect(onStart).toHaveBeenCalledWith({ useTomorrowPlan: false });
  });
});
