import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EndOfDayCard } from "./EndOfDayCard";

describe("EndOfDayCard", () => {
  it("shows 'Have a good night' before midnight", () => {
    render(<EndOfDayCard afterMidnight={false} hasTomorrowPlan={false} onStart={async () => {}} />);
    expect(screen.getByText(/have a good night/i)).toBeVisible();
  });

  it("shows 'Tap to start day' prompt + StartDayButton after midnight", () => {
    render(<EndOfDayCard afterMidnight={true} hasTomorrowPlan={false} onStart={async () => {}} />);
    expect(screen.getByText(/tap to start day/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /start new day/i })).toBeVisible();
  });

  it("uses 'Tap to start plan' wording when a Tomorrow Plan exists", () => {
    render(<EndOfDayCard afterMidnight={true} hasTomorrowPlan={true} onStart={async () => {}} />);
    expect(screen.getByText(/tap to start plan/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /start day from plan/i })).toBeVisible();
  });

  it("calls onStart with NO args when StartDayButton confirms (load-bearing — the card strips StartDayButton's { useTomorrowPlan } arg)", async () => {
    // `StartDayButton` forwards `{ useTomorrowPlan: boolean }` to its
    // `onStart` prop. `EndOfDayCard` wraps that prop with
    // `async () => onStart()` to drop the arg before calling the
    // outer `onStart`. The `toHaveBeenCalledWith()` (zero args) below
    // proves that arg-stripping is in place — if it ever regresses,
    // the page's `handleStart` signature wouldn't match.
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<EndOfDayCard afterMidnight={true} hasTomorrowPlan={false} onStart={onStart} />);
    await userEvent.click(screen.getByRole("button", { name: /start new day/i }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /confirm|start/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith();
  });
});
