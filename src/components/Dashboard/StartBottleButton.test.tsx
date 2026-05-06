import { describe, it, expect, vi } from "vitest";
import type { Event } from "@/domain";
import { renderWithAuth, screen, userEvent, within } from "@/test-utils";
import { StartBottleButton } from "./StartBottleButton";

describe("StartBottleButton", () => {
  it("renders 'Start Bottle Now' label", () => {
    renderWithAuth(
      <StartBottleButton defaultAmountOz={5} dayId="d1" nextNumber={1} onLog={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /start bottle now/i })).toBeVisible();
  });

  it("calls onLog with a bottle event at current time + default amount", async () => {
    const onLog = vi.fn();
    renderWithAuth(
      <StartBottleButton defaultAmountOz={5} dayId="d1" nextNumber={1} onLog={onLog} />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onLog).toHaveBeenCalledTimes(1);
    const arg = onLog.mock.calls[0]?.[0] as Event;
    expect(arg).toMatchObject({
      type: "bottle",
      eventKey: "bottle_1",
      label: "Bottle 1",
      amountOz: 5,
      source: "actual",
      status: "actual",
      dayId: "d1",
    });
    // startTime is "HH:MM" 24-hour
    expect(arg.startTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it("uses correct number for second bottle", async () => {
    const onLog = vi.fn();
    renderWithAuth(
      <StartBottleButton defaultAmountOz={5} dayId="d1" nextNumber={2} onLog={onLog} />,
    );
    await userEvent.click(screen.getByRole("button"));
    const arg = onLog.mock.calls[0]?.[0] as Event;
    expect(arg.eventKey).toBe("bottle_2");
    expect(arg.label).toBe("Bottle 2");
  });

  it("shows '✓ Bottle logged' feedback after a successful tap", async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);
    renderWithAuth(
      <StartBottleButton defaultAmountOz={5} dayId="d1" nextNumber={1} onLog={onLog} />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent(/bottle logged/i);
  });

  it("does NOT show confirm dialog when last bottle is older than the interval", async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);
    // Last bottle 2 hours ago — well past the 20-min default
    const twoHoursAgo = nowMinusMinutes(120);
    renderWithAuth(
      <StartBottleButton
        defaultAmountOz={5}
        dayId="d1"
        nextNumber={2}
        lastBottleTime={twoHoursAgo}
        minIntervalMinutes={20}
        onLog={onLog}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it("shows confirm dialog when last bottle is within the interval", async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);
    const fiveMinutesAgo = nowMinusMinutes(5);
    renderWithAuth(
      <StartBottleButton
        defaultAmountOz={5}
        dayId="d1"
        nextNumber={2}
        lastBottleTime={fiveMinutesAgo}
        minIntervalMinutes={20}
        onLog={onLog}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /start bottle now/i }));
    // No log yet — should show confirm
    expect(onLog).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /start another bottle/i })).toBeVisible();
  });

  it("logs after the user confirms the dialog", async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);
    const fiveMinutesAgo = nowMinusMinutes(5);
    renderWithAuth(
      <StartBottleButton
        defaultAmountOz={5}
        dayId="d1"
        nextNumber={2}
        lastBottleTime={fiveMinutesAgo}
        minIntervalMinutes={20}
        onLog={onLog}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /start bottle now/i }));
    const dialog = screen.getByRole("dialog");
    const confirmButton = within(dialog).getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it("does NOT log if the user cancels the dialog", async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);
    const fiveMinutesAgo = nowMinusMinutes(5);
    renderWithAuth(
      <StartBottleButton
        defaultAmountOz={5}
        dayId="d1"
        nextNumber={2}
        lastBottleTime={fiveMinutesAgo}
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

function nowMinusMinutes(min: number): string {
  const d = new Date();
  const total = d.getHours() * 60 + d.getMinutes() - min;
  const h = Math.floor((total + 24 * 60) / 60) % 24;
  const m = ((total % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
