import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event, TimeMin } from "@/v3/schemas";
import { StartBottleButton } from "./StartBottleButton";

// Audit P2-4: this file previously called `new Date()` at test time
// inside a `nowMinusMinutes` helper. Tests running within a few
// seconds of a minute boundary (esp. midnight) computed a wrap-around
// modulo that flipped the confirm-dialog branch. Replaced with fake
// timers pinned to a deterministic time; the helper computes
// TimeMin offsets relative to that fixed clock instead of wall time.

const FIXED_NOW = new Date("2026-05-12T14:30:00.000");
const NOW_MIN: TimeMin = 14 * 60 + 30; // 870

/** TimeMin `min` minutes before the pinned NOW_MIN. Pure math — no
 *  wall-clock involved; no midnight-wraparound surprises. */
function timeMinMinusMinutes(min: number): TimeMin {
  return NOW_MIN - min;
}

describe("StartBottleButton", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
    // startTime is `currentLocalMinutes()` of the fake clock = 14:30 = 870.
    expect(arg.startTime).toBe(NOW_MIN);
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
        lastBottleTime={timeMinMinusMinutes(120)}
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
        lastBottleTime={timeMinMinusMinutes(5)}
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
        lastBottleTime={timeMinMinusMinutes(5)}
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
        lastBottleTime={timeMinMinusMinutes(5)}
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
