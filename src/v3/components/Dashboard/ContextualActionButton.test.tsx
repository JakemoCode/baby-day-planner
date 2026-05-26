import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NO_OWNER, type Event, type TimeMin } from "@/v3/schemas";
import { ContextualActionButton, type ContextualActionButtonProps } from "./ContextualActionButton";
import * as timeModule from "@/v3/ui/time";

const hm = (h: number, m = 0): TimeMin => h * 60 + m;

const inProgressNap = (): Event => ({
  id: "recorded_nap_1",
  dayId: "d1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  label: "Nap 1",
  startTime: hm(13),
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "recorded", annotatedAt: hm(13) },
});

const inProgressBedtime = (): Event => ({
  id: "recorded_bedtime",
  dayId: "d1",
  eventKey: "bedtime",
  type: "bedtime",
  kind: "block",
  label: "Bedtime",
  startTime: hm(19),
  endTime: hm(30),
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "recorded", annotatedAt: hm(19) },
});

const projectedBottle = (startTime: TimeMin): Event => ({
  id: `proj_bottle_${startTime}`,
  dayId: "d1",
  eventKey: "bottle_2",
  type: "bottle",
  kind: "instant",
  label: "Bottle 2",
  startTime,
  amountOz: 6,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
});

function makeProps(
  overrides: Partial<ContextualActionButtonProps> = {},
): ContextualActionButtonProps {
  return {
    inProgressNap: undefined,
    inProgressBedtime: undefined,
    nextProjectedBottle: undefined,
    dayId: "d1",
    defaultBottleAmountOz: 6,
    nowMinutes: hm(10),
    fallbackBottleNumber: 1,
    onEndNap: vi.fn().mockResolvedValue(undefined),
    onWakeRequest: vi.fn(),
    onLogBottle: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ContextualActionButton", () => {
  beforeEach(() => {
    // Pin currentLocalMinutes so click handlers write deterministic times.
    vi.spyOn(timeModule, "currentLocalMinutes").mockReturnValue(hm(13, 30));
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders nothing in hidden mode", () => {
    render(<ContextualActionButton {...makeProps()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders 'End Nap' when an in-progress nap exists", () => {
    render(<ContextualActionButton {...makeProps({ inProgressNap: inProgressNap() })} />);
    expect(screen.getByRole("button", { name: /end nap/i })).toBeVisible();
  });

  it("renders 'End overnight sleep' when an in-progress bedtime exists and no bottle window is open", () => {
    render(
      <ContextualActionButton
        {...makeProps({ inProgressBedtime: inProgressBedtime(), nowMinutes: hm(6) })}
      />,
    );
    expect(screen.getByRole("button", { name: /end overnight sleep/i })).toBeVisible();
  });

  it("renders 'Log Bottle Time' when projected bottle is within ±15min and no in-progress sleep", () => {
    render(
      <ContextualActionButton
        {...makeProps({
          nextProjectedBottle: projectedBottle(hm(12)),
          nowMinutes: hm(11, 55),
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /log bottle time/i })).toBeVisible();
  });

  it("End Nap click fires onEndNap with the nap and current local minutes", async () => {
    const nap = inProgressNap();
    const onEndNap = vi.fn().mockResolvedValue(undefined);
    render(<ContextualActionButton {...makeProps({ inProgressNap: nap, onEndNap })} />);
    await userEvent.click(screen.getByRole("button", { name: /end nap/i }));
    expect(onEndNap).toHaveBeenCalledWith(nap, hm(13, 30));
  });

  it("End overnight sleep click fires onWakeRequest (no args)", async () => {
    const onWakeRequest = vi.fn();
    render(
      <ContextualActionButton
        {...makeProps({
          inProgressBedtime: inProgressBedtime(),
          nowMinutes: hm(6),
          onWakeRequest,
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /end overnight sleep/i }));
    expect(onWakeRequest).toHaveBeenCalledTimes(1);
  });

  it("Log Bottle click fires onLogBottle with a promoted recorded bottle", async () => {
    const projected = projectedBottle(hm(12));
    const onLogBottle = vi.fn().mockResolvedValue(undefined);
    render(
      <ContextualActionButton
        {...makeProps({
          nextProjectedBottle: projected,
          nowMinutes: hm(11, 55),
          onLogBottle,
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /log bottle time/i }));
    expect(onLogBottle).toHaveBeenCalledTimes(1);
    const bottle: Event = onLogBottle.mock.calls[0]![0];
    expect(bottle.type).toBe("bottle");
    expect(bottle.eventKey).toBe(projected.eventKey);
    expect(bottle.id).toBe(`recorded_${projected.eventKey}`);
    expect(bottle.startTime).toBe(hm(13, 30));
    expect(bottle.amountOz).toBe(6);
    expect(bottle.lifecycle).toEqual({ state: "completed", committedAt: hm(13, 30) });
  });
});
