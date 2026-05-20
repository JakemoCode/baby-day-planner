import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event, TimeMin } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import { NapActionButton, type NapActionButtonProps } from "./NapActionButton";

const DEFAULT_NAP_MINUTES = 90;
const DEFAULT_WAKE_TIME = 7 * 60; // 7:00 AM

const napInProgress = (): Event => ({
  id: "nap_1",
  dayId: "d1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  label: "Nap 1",
  startTime: 9 * 60,
  endTime: 9 * 60 + DEFAULT_NAP_MINUTES,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
});

const bedtimeInProgress = (): Event => ({
  id: "bedtime",
  dayId: "d1",
  eventKey: "bedtime",
  type: "bedtime",
  kind: "block",
  label: "Bedtime",
  startTime: 19 * 60 + 30,
  endTime: DEFAULT_WAKE_TIME + 24 * 60,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "recorded", annotatedAt: 19 * 60 + 30 },
});

const projectedNap = (n: number): Event => ({
  id: `proj_nap_${n}`,
  dayId: "d1",
  eventKey: `nap_${n}`,
  type: "nap",
  kind: "block",
  label: `Nap ${n}`,
  startTime: 9 * 60,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
});

const PRE_THRESHOLD = 10 * 60; // 10:00 AM
const POST_THRESHOLD = 19 * 60 + 30; // 7:30 PM
const THRESHOLD = 19 * 60; // 7:00 PM

/** Helper: all required props with safe defaults — tests override what they care about. */
function makeProps(overrides: Partial<NapActionButtonProps> = {}): NapActionButtonProps {
  return {
    inProgressNap: undefined,
    inProgressBedtime: undefined,
    dayId: "d1",
    nextProjectedNap: undefined,
    nowMinutes: PRE_THRESHOLD as TimeMin,
    bedtimeThreshold: THRESHOLD as TimeMin,
    defaultNapLengthMinutes: DEFAULT_NAP_MINUTES,
    defaultWakeTime: DEFAULT_WAKE_TIME as TimeMin,
    onStart: vi.fn().mockResolvedValue(undefined) as NapActionButtonProps["onStart"],
    onEnd: vi.fn().mockResolvedValue(undefined) as NapActionButtonProps["onEnd"],
    onStartBedtime: vi.fn().mockResolvedValue(undefined) as NapActionButtonProps["onStartBedtime"],
    onEndBedtime: vi.fn().mockResolvedValue(undefined) as NapActionButtonProps["onEndBedtime"],
    ...overrides,
  };
}

describe("NapActionButton", () => {
  it("renders 'Start Nap Now' before threshold when no nap is in progress", () => {
    render(<NapActionButton {...makeProps({ nextProjectedNap: projectedNap(1) })} />);
    expect(screen.getByRole("button", { name: /start nap now/i })).toBeVisible();
  });

  it("renders 'End Nap' when a nap is in progress (regardless of threshold)", () => {
    render(
      <NapActionButton
        {...makeProps({ inProgressNap: napInProgress(), nowMinutes: POST_THRESHOLD as TimeMin })}
      />,
    );
    expect(screen.getByRole("button", { name: /end nap/i })).toBeVisible();
  });

  it("promotes nextProjectedNap on Start Nap — lifecycle recorded with endTime set", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<NapActionButton {...makeProps({ nextProjectedNap: projectedNap(2), onStart })} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onStart).toHaveBeenCalledTimes(1);
    const arg = onStart.mock.calls[0]?.[0] as Event;
    expect(arg).toMatchObject({
      id: "nap_2",
      type: "nap",
      kind: "block",
      eventKey: "nap_2",
      label: "Nap 2",
      dayId: "d1",
      hasPutdown: false,
      owner: NO_OWNER,
    });
    // endTime must be set (not undefined) — this was the image bug
    expect(arg.endTime).toBeDefined();
    expect(typeof arg.endTime).toBe("number");
    // lifecycle must be recorded (not started)
    expect(arg.lifecycle.state).toBe("recorded");
    // endTime should be startTime + defaultNapLengthMinutes
    expect(arg.endTime).toBe(arg.startTime + DEFAULT_NAP_MINUTES);
  });

  it("calls onEnd with the in-progress nap and current TimeMin endTime", async () => {
    const onEnd = vi.fn().mockResolvedValue(undefined);
    const nap = napInProgress();
    render(<NapActionButton {...makeProps({ inProgressNap: nap, onEnd })} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onEnd).toHaveBeenCalledTimes(1);
    const [calledNap, endTime] = onEnd.mock.calls[0] ?? [];
    expect(calledNap).toEqual(nap);
    expect(typeof endTime).toBe("number");
    expect(endTime).toBeGreaterThanOrEqual(0);
    expect(endTime).toBeLessThan(24 * 60);
  });

  it("falls back to 'Start Bedtime Now' when no in-progress sleep + not past threshold + no nextProjectedNap", () => {
    // Edge case: bedtime already completed earlier and the cascade has
    // suppressed all subsequent naps. The button stays actionable —
    // saveEvent's deterministic id="bedtime" lets a re-tap update the
    // existing bedtime doc with a fresh startTime.
    render(
      <NapActionButton
        {...makeProps({
          inProgressNap: undefined,
          inProgressBedtime: undefined,
          nextProjectedNap: undefined,
          nowMinutes: PRE_THRESHOLD as TimeMin,
        })}
      />,
    );
    const btn = screen.getByRole("button", { name: /start bedtime now/i });
    expect(btn).toBeVisible();
    expect(btn).not.toBeDisabled();
  });
});

describe("NapActionButton — CTA swap past bedtime threshold (§F8)", () => {
  // Per spec PR #146 R4: when nowMinutes ≥ bedtimeThreshold and no
  // nap is in progress, the dashboard CTA swaps from "Start Nap Now"
  // to "Start Bedtime Now". Tap creates a bedtime doc (eventKey
  // "bedtime", lifecycle recorded). Removes a class of late-nap
  // weirdness at the source: once it's bedtime o'clock, the primary
  // action IS bedtime.

  it("renders 'Start Bedtime Now' when nowMinutes ≥ bedtimeThreshold", () => {
    render(<NapActionButton {...makeProps({ nowMinutes: POST_THRESHOLD as TimeMin })} />);
    expect(screen.getByRole("button", { name: /start bedtime now/i })).toBeVisible();
  });

  it("calls onStartBedtime with a bedtime event with endTime set when tapped past threshold", async () => {
    const onStartBedtime = vi.fn().mockResolvedValue(undefined);
    render(
      <NapActionButton {...makeProps({ nowMinutes: POST_THRESHOLD as TimeMin, onStartBedtime })} />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onStartBedtime).toHaveBeenCalledTimes(1);
    const arg = onStartBedtime.mock.calls[0]?.[0] as Event;
    expect(arg).toMatchObject({
      id: "bedtime",
      type: "bedtime",
      kind: "block",
      eventKey: "bedtime",
      label: "Bedtime",
      dayId: "d1",
    });
    // endTime must be set for bedtime (nextDayAt(defaultWakeTime) = 7:00 + 1440 = 1860)
    expect(arg.endTime).toBe(DEFAULT_WAKE_TIME + 24 * 60);
    expect(arg.lifecycle.state).toBe("recorded");
  });
});

describe("NapActionButton — in-progress bedtime detection (Bug A from PR #166 dogfooding)", () => {
  it("renders 'End overnight sleep' when a bedtime is in progress", () => {
    // After Start Bedtime Now creates a recorded bedtime, the CTA must
    // switch to 'End overnight sleep' — not stay on 'Start Bedtime Now'.
    render(
      <NapActionButton
        {...makeProps({
          inProgressBedtime: bedtimeInProgress(),
          nowMinutes: POST_THRESHOLD as TimeMin,
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /end overnight sleep/i })).toBeVisible();
  });

  it("calls onEndBedtime with the in-progress bedtime and current TimeMin on click", async () => {
    const onEndBedtime = vi.fn().mockResolvedValue(undefined);
    const bedtime = bedtimeInProgress();
    render(
      <NapActionButton
        {...makeProps({
          inProgressBedtime: bedtime,
          nowMinutes: POST_THRESHOLD as TimeMin,
          onEndBedtime,
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onEndBedtime).toHaveBeenCalledTimes(1);
    const [calledBedtime, endTime] = onEndBedtime.mock.calls[0] ?? [];
    expect(calledBedtime).toEqual(bedtime);
    expect(typeof endTime).toBe("number");
    expect(endTime).toBeGreaterThanOrEqual(0);
    expect(endTime).toBeLessThan(24 * 60 * 2); // bedtime endTime can be next-day
  });

  it("in-progress nap takes precedence over in-progress bedtime (impossible in practice, but deterministic)", () => {
    // The cascade prevents simultaneous in-progress nap + bedtime, but if
    // data is corrupted, nap wins (was most recently user-initiated).
    render(
      <NapActionButton
        {...makeProps({
          inProgressNap: napInProgress(),
          inProgressBedtime: bedtimeInProgress(),
          nowMinutes: POST_THRESHOLD as TimeMin,
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /end nap/i })).toBeVisible();
  });
});
