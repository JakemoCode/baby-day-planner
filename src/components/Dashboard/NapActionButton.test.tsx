import { describe, it, expect, vi } from "vitest";
import type { Event } from "@/domain";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import { NapActionButton } from "./NapActionButton";

const napInProgress = (): Event => ({
  id: "nap-in-progress",
  dayId: "d1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  label: "Nap 1",
  startTime: "09:00",
  source: "actual",
  status: "actual",
});

describe("NapActionButton", () => {
  it("renders 'Start Nap Now' when no nap is in progress", () => {
    renderWithAuth(
      <NapActionButton
        inProgressNap={undefined}
        dayId="d1"
        nextNumber={1}
        onStart={() => {}}
        onEnd={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /start nap now/i })).toBeVisible();
  });

  it("renders 'End Nap' when a nap is in progress", () => {
    renderWithAuth(
      <NapActionButton
        inProgressNap={napInProgress()}
        dayId="d1"
        nextNumber={2}
        onStart={() => {}}
        onEnd={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /end nap/i })).toBeVisible();
  });

  it("calls onStart with a nap event when starting", async () => {
    const onStart = vi.fn();
    renderWithAuth(
      <NapActionButton
        inProgressNap={undefined}
        dayId="d1"
        nextNumber={1}
        onStart={onStart}
        onEnd={() => {}}
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
      source: "actual",
    });
    expect(arg.endTime).toBeUndefined();
  });

  it("calls onEnd with the nap and current end time when ending", async () => {
    const onEnd = vi.fn();
    const nap = napInProgress();
    renderWithAuth(
      <NapActionButton
        inProgressNap={nap}
        dayId="d1"
        nextNumber={2}
        onStart={() => {}}
        onEnd={onEnd}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onEnd).toHaveBeenCalledTimes(1);
    const [calledNap, endTime] = onEnd.mock.calls[0] ?? [];
    expect(calledNap).toEqual(nap);
    expect(endTime).toMatch(/^\d{2}:\d{2}$/);
  });
});
