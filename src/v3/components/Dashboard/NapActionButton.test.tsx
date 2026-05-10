import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event } from "@/v3/schemas";
import { NapActionButton } from "./NapActionButton";

const napInProgress = (): Event => ({
  id: "nap-in-progress",
  dayId: "d1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  label: "Nap 1",
  startTime: 9 * 60,
  hasPutdown: false,
  lifecycle: { state: "started", committedAt: 9 * 60 },
});

describe("NapActionButton", () => {
  it("renders 'Start Nap Now' when no nap is in progress", () => {
    render(
      <NapActionButton
        inProgressNap={undefined}
        dayId="d1"
        nextNumber={1}
        onStart={async () => {}}
        onEnd={async () => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /start nap now/i })).toBeVisible();
  });

  it("renders 'End Nap' when a nap is in progress", () => {
    render(
      <NapActionButton
        inProgressNap={napInProgress()}
        dayId="d1"
        nextNumber={2}
        onStart={async () => {}}
        onEnd={async () => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /end nap/i })).toBeVisible();
  });

  it("calls onStart with a started-lifecycle nap event when starting", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(
      <NapActionButton
        inProgressNap={undefined}
        dayId="d1"
        nextNumber={1}
        onStart={onStart}
        onEnd={async () => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onStart).toHaveBeenCalledTimes(1);
    const arg = onStart.mock.calls[0]?.[0] as Event;
    expect(arg).toMatchObject({
      type: "nap",
      kind: "block",
      eventKey: "nap_1",
      label: "Nap 1",
      dayId: "d1",
      hasPutdown: false,
    });
    expect(arg.lifecycle.state).toBe("started");
    expect(typeof arg.startTime).toBe("number");
    expect(arg.endTime).toBeUndefined();
    // newEventId-prefixed
    expect(arg.id).toMatch(/^nap_/);
  });

  it("uses correct number for second nap", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(
      <NapActionButton
        inProgressNap={undefined}
        dayId="d1"
        nextNumber={2}
        onStart={onStart}
        onEnd={async () => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    const arg = onStart.mock.calls[0]?.[0] as Event;
    expect(arg.eventKey).toBe("nap_2");
    expect(arg.label).toBe("Nap 2");
  });

  it("calls onEnd with the started nap and current TimeMin endTime", async () => {
    const onEnd = vi.fn().mockResolvedValue(undefined);
    const nap = napInProgress();
    render(
      <NapActionButton
        inProgressNap={nap}
        dayId="d1"
        nextNumber={2}
        onStart={async () => {}}
        onEnd={onEnd}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onEnd).toHaveBeenCalledTimes(1);
    const [calledNap, endTime] = onEnd.mock.calls[0] ?? [];
    expect(calledNap).toEqual(nap);
    expect(typeof endTime).toBe("number");
    expect(endTime).toBeGreaterThanOrEqual(0);
    expect(endTime).toBeLessThan(24 * 60);
  });
});
