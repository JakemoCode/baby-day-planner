import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { NO_OWNER, type Event, type TimeMin } from "@/v3/schemas";
import { axe } from "@/test-utils";
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

function makeProps(overrides: Partial<ContextualActionButtonProps> = {}): ContextualActionButtonProps {
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

describe("ContextualActionButton a11y", () => {
  beforeEach(() => {
    vi.spyOn(timeModule, "currentLocalMinutes").mockReturnValue(hm(13, 30));
  });
  afterEach(() => vi.restoreAllMocks());

  it("has no axe violations when showing End Nap button", async () => {
    const { container } = render(
      <ContextualActionButton {...makeProps({ inProgressNap: inProgressNap() })} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
