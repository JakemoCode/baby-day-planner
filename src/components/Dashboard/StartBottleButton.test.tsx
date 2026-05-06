import { describe, it, expect, vi } from "vitest";
import type { Event } from "@/domain";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
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
});
