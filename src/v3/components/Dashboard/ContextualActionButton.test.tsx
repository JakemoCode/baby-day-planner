import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

  it("renders 'Log bottle now' when projected bottle is within ±15min and no in-progress sleep", () => {
    render(
      <ContextualActionButton
        {...makeProps({
          nextProjectedBottle: projectedBottle(hm(12)),
          nowMinutes: hm(11, 55),
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /log bottle now/i })).toBeVisible();
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
    await userEvent.click(screen.getByRole("button", { name: /log bottle now/i }));
    expect(onLogBottle).toHaveBeenCalledTimes(1);
    const bottle: Event = onLogBottle.mock.calls[0]![0];
    expect(bottle.type).toBe("bottle");
    expect(bottle.eventKey).toBe(projected.eventKey);
    expect(bottle.id).toBe(`recorded_${projected.eventKey}`);
    expect(bottle.startTime).toBe(hm(13, 30));
    expect(bottle.amountOz).toBe(6);
    expect(bottle.lifecycle).toEqual({ state: "completed", committedAt: hm(13, 30) });
  });

  describe("logged-state UX (§F66 fast-follow A3)", () => {
    const loggedBottle = (startTime: TimeMin): Event => ({
      ...projectedBottle(startTime),
      lifecycle: { state: "completed", committedAt: startTime },
    });

    it("renders '✓ Bottle logged' when the in-window bottle is already completed", () => {
      render(
        <ContextualActionButton
          {...makeProps({
            nextProjectedBottle: loggedBottle(hm(11, 50)),
            nowMinutes: hm(11, 55),
          })}
        />,
      );
      expect(screen.getByRole("button", { name: /bottle logged/i })).toBeVisible();
      expect(screen.queryByRole("button", { name: /log bottle now/i })).toBeNull();
    });

    it("re-tap on '✓ Bottle logged' opens the confirm dialog (does NOT silently overwrite)", async () => {
      const onLogBottle = vi.fn().mockResolvedValue(undefined);
      render(
        <ContextualActionButton
          {...makeProps({
            nextProjectedBottle: loggedBottle(hm(11, 50)),
            nowMinutes: hm(11, 55),
            onLogBottle,
          })}
        />,
      );
      await userEvent.click(screen.getByRole("button", { name: /bottle logged/i }));
      expect(onLogBottle).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: /change the recorded time/i })).toBeVisible();
    });

    it("confirm dialog reports the elapsed minutes since the recorded bottle", () => {
      render(
        <ContextualActionButton
          {...makeProps({
            nextProjectedBottle: loggedBottle(hm(11, 50)),
            nowMinutes: hm(11, 57),
          })}
        />,
      );
      // Re-tap surfaces the dialog with "logged 7 minutes ago" copy.
      fireEvent.click(screen.getByRole("button", { name: /bottle logged/i }));
      expect(screen.getByText(/logged 7 minutes ago/i)).toBeVisible();
    });

    it("confirm dialog Confirm fires a fresh onLogBottle with startTime = currentLocalMinutes", async () => {
      const onLogBottle = vi.fn().mockResolvedValue(undefined);
      const projected = loggedBottle(hm(11, 50));
      render(
        <ContextualActionButton
          {...makeProps({
            nextProjectedBottle: projected,
            nowMinutes: hm(11, 55),
            onLogBottle,
          })}
        />,
      );
      await userEvent.click(screen.getByRole("button", { name: /bottle logged/i }));
      await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
      expect(onLogBottle).toHaveBeenCalledTimes(1);
      const bottle: Event = onLogBottle.mock.calls[0]![0];
      expect(bottle.eventKey).toBe(projected.eventKey);
      expect(bottle.startTime).toBe(hm(13, 30)); // currentLocalMinutes spy
    });

    it("confirm dialog Cancel does NOT fire onLogBottle", async () => {
      const onLogBottle = vi.fn().mockResolvedValue(undefined);
      render(
        <ContextualActionButton
          {...makeProps({
            nextProjectedBottle: loggedBottle(hm(11, 50)),
            nowMinutes: hm(11, 55),
            onLogBottle,
          })}
        />,
      );
      await userEvent.click(screen.getByRole("button", { name: /bottle logged/i }));
      await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onLogBottle).not.toHaveBeenCalled();
    });

    it("§F66 audit: '✓ Bottle logged' auto-hides after LOGGED_AFFORDANCE_MS (4000ms)", () => {
      // AffordanceTimer schedules a setTimeout to unmount the button so
      // a subsequent end-nap / log-bottle can take over. Without a
      // timer test, regressions to the constant (or removing the
      // cleanup) would only surface in the field. Fake timers let us
      // pin both the "still visible at 3999ms" and "gone past 4000ms"
      // sides of the boundary.
      vi.useFakeTimers();
      try {
        render(
          <ContextualActionButton
            {...makeProps({
              nextProjectedBottle: loggedBottle(hm(11, 50)),
              nowMinutes: hm(11, 55),
            })}
          />,
        );
        expect(screen.getByRole("button", { name: /bottle logged/i })).toBeVisible();
        act(() => {
          vi.advanceTimersByTime(3999);
        });
        expect(screen.getByRole("button", { name: /bottle logged/i })).toBeVisible();
        act(() => {
          vi.advanceTimersByTime(2); // past 4000ms
        });
        expect(screen.queryByRole("button", { name: /bottle logged/i })).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("auto-promoted (lifecycle.state === 'recorded', not 'completed') still shows 'Log bottle now' — user hasn't committed yet", () => {
      const autoPromoted: Event = {
        ...projectedBottle(hm(11, 50)),
        lifecycle: { state: "recorded", annotatedAt: hm(11, 50) },
      };
      render(
        <ContextualActionButton
          {...makeProps({
            nextProjectedBottle: autoPromoted,
            nowMinutes: hm(11, 55),
          })}
        />,
      );
      expect(screen.getByRole("button", { name: /log bottle now/i })).toBeVisible();
    });
  });
});
