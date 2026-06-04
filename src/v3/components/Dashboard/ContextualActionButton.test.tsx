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

function makeProps(
  overrides: Partial<ContextualActionButtonProps> = {},
): ContextualActionButtonProps {
  return {
    inProgressNap: undefined,
    inProgressBedtime: undefined,
    nowMinutes: hm(2), // after midnight by default, so the bedtime CTA is eligible
    onEndNap: vi.fn().mockResolvedValue(undefined),
    onWakeRequest: vi.fn(),
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

  it("renders 'End overnight sleep' when bedtime is in progress and it's past midnight", () => {
    render(<ContextualActionButton {...makeProps({ inProgressBedtime: inProgressBedtime() })} />);
    expect(screen.getByRole("button", { name: /end overnight sleep/i })).toBeVisible();
  });

  it("hides 'End overnight sleep' before midnight (e.g. 8 PM, right after bedtime)", () => {
    render(
      <ContextualActionButton
        {...makeProps({ inProgressBedtime: inProgressBedtime(), nowMinutes: hm(20) })}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
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
        {...makeProps({ inProgressBedtime: inProgressBedtime(), onWakeRequest })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /end overnight sleep/i }));
    expect(onWakeRequest).toHaveBeenCalledTimes(1);
  });
});
