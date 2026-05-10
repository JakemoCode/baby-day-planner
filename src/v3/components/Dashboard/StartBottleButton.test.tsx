import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event, TimeMin } from "@/v3/schemas";
import { StartBottleButton } from "./StartBottleButton";

function nowMinusMinutes(min: number): TimeMin {
  const d = new Date();
  const total = d.getHours() * 60 + d.getMinutes() - min;
  return ((total % (24 * 60)) + 24 * 60) % (24 * 60);
}

describe("StartBottleButton", () => {
  it("renders 'Start Bottle Now' label", () => {
    render(
      <StartBottleButton
        defaultAmountOz={5}
        dayId="d1"
        nextNumber={1}
        onLog={async () => {}}
        minIntervalMinutes={20}
      />,
    );
    expect(screen.getByRole("button", { name: /start bottle now/i })).toBeVisible();
  });

  it("calls onLog with a completed-lifecycle bottle event at current time + default amount", async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);
    render(
      <StartBottleButton
        defaultAmountOz={5}
        dayId="d1"
        nextNumber={1}
        onLog={onLog}
        minIntervalMinutes={20}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onLog).toHaveBeenCalledTimes(1);
    const arg = onLog.mock.calls[0]?.[0] as Event;
    expect(arg).toMatchObject({
      type: "bottle",
      kind: "instant",
      eventKey: "bottle_1",
      label: "Bottle 1",
      amountOz: 5,
      dayId: "d1",
      hasPutdown: false,
    });
    expect(arg.lifecycle.state).toBe("completed");
    expect(typeof arg.startTime).toBe("number");
    expect(arg.id).toMatch(/^bottle_/);
  });

  it("uses correct number for second bottle", async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);
    render(
      <StartBottleButton
        defaultAmountOz={5}
        dayId="d1"
        nextNumber={2}
        onLog={onLog}
        minIntervalMinutes={20}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    const arg = onLog.mock.calls[0]?.[0] as Event;
    expect(arg.eventKey).toBe("bottle_2");
    expect(arg.label).toBe("Bottle 2");
  });

  it("shows '✓ Bottle logged' feedback after a successful tap", async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);
    render(
      <StartBottleButton
        defaultAmountOz={5}
        dayId="d1"
        nextNumber={1}
        onLog={onLog}
        minIntervalMinutes={20}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent(/bottle logged/i);
  });

  it("does NOT show confirm dialog when last bottle is older than the interval", async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);
    render(
      <StartBottleButton
        defaultAmountOz={5}
        dayId="d1"
        nextNumber={2}
        lastBottleTime={nowMinusMinutes(120)}
        minIntervalMinutes={20}
        onLog={onLog}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it("shows confirm dialog when last bottle is within the interval", async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);
    render(
      <StartBottleButton
        defaultAmountOz={5}
        dayId="d1"
        nextNumber={2}
        lastBottleTime={nowMinusMinutes(5)}
        minIntervalMinutes={20}
        onLog={onLog}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /start bottle now/i }));
    expect(onLog).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /start another bottle/i })).toBeVisible();
  });

  it("logs after the user confirms the dialog", async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);
    render(
      <StartBottleButton
        defaultAmountOz={5}
        dayId="d1"
        nextNumber={2}
        lastBottleTime={nowMinusMinutes(5)}
        minIntervalMinutes={20}
        onLog={onLog}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /start bottle now/i }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /confirm/i }));
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it("does NOT log if the user cancels the dialog", async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);
    render(
      <StartBottleButton
        defaultAmountOz={5}
        dayId="d1"
        nextNumber={2}
        lastBottleTime={nowMinusMinutes(5)}
        minIntervalMinutes={20}
        onLog={onLog}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /start bottle now/i }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(onLog).not.toHaveBeenCalled();
  });
});
