import { describe, it, expect, vi } from "vitest";
import type { Event } from "@/domain";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import { TimelineList } from "./TimelineList";

const wake = (): Event => ({
  id: "w",
  dayId: "d1",
  eventKey: "wake",
  type: "wake",
  label: "Wake",
  startTime: "07:00",
  source: "projected",
  status: "projected",
});

const wakeWindow = (n: number, start: string, end: string): Event => ({
  id: `ww${n}`,
  dayId: "d1",
  eventKey: `wake_window_${n}`,
  type: "wake_window",
  label: `Wake Window ${n}`,
  startTime: start,
  endTime: end,
  source: "projected",
  status: "projected",
});

const nap = (n: number, start: string, end: string): Event => ({
  id: `n${n}`,
  dayId: "d1",
  eventKey: `nap_${n}`,
  type: "nap",
  label: `Nap ${n}`,
  startTime: start,
  endTime: end,
  source: "projected",
  status: "projected",
});

const bottle = (n: number, start: string): Event => ({
  id: `b${n}`,
  dayId: "d1",
  eventKey: `bottle_${n}`,
  type: "bottle",
  label: `Bottle ${n}`,
  startTime: start,
  amountOz: 5,
  source: "actual",
  status: "actual",
});

describe("TimelineList", () => {
  it("renders an empty state when no events", () => {
    renderWithAuth(<TimelineList events={[]} />);
    expect(screen.getByText(/nothing scheduled|no events/i)).toBeVisible();
  });

  it("renders a DurationBlock for each nap", () => {
    renderWithAuth(<TimelineList events={[nap(1, "09:00", "10:00"), nap(2, "12:00", "13:00")]} />);
    const blocks = screen.getAllByTestId("duration-block");
    expect(blocks).toHaveLength(2);
  });

  it("renders a PointMarker for each bottle and wake", () => {
    renderWithAuth(<TimelineList events={[wake(), bottle(1, "07:05"), bottle(2, "10:00")]} />);
    const markers = screen.getAllByTestId("point-marker");
    expect(markers).toHaveLength(3);
  });

  it("calls onEventTap with the tapped event", async () => {
    const onEventTap = vi.fn();
    renderWithAuth(<TimelineList events={[bottle(1, "07:05")]} onEventTap={onEventTap} />);
    await userEvent.click(screen.getByRole("button", { name: /Bottle 1/ }));
    expect(onEventTap).toHaveBeenCalledTimes(1);
    expect(onEventTap.mock.calls[0]?.[0]).toMatchObject({ id: "b1" });
  });

  it("renders extras with endTime as DurationBlocks", () => {
    const extra: Event = {
      id: "ex",
      dayId: "d1",
      eventKey: "extra_1",
      type: "extra",
      label: "Pediatrician",
      startTime: "11:00",
      endTime: "12:00",
      source: "manual",
      status: "completed",
    };
    renderWithAuth(<TimelineList events={[extra]} />);
    expect(screen.getByTestId("duration-block")).toBeVisible();
  });

  it("renders extras without endTime as PointMarkers", () => {
    const extra: Event = {
      id: "ex",
      dayId: "d1",
      eventKey: "extra_1",
      type: "extra",
      label: "Vaccine",
      startTime: "11:00",
      source: "manual",
      status: "completed",
    };
    renderWithAuth(<TimelineList events={[extra]} />);
    expect(screen.getByTestId("point-marker")).toBeVisible();
  });

  it("renders a current time indicator when nowMinutes is provided", () => {
    renderWithAuth(
      <TimelineList events={[wake(), nap(1, "09:00", "10:00")]} nowMinutes={8 * 60 + 30} />,
    );
    expect(screen.getByLabelText(/current time/i)).toBeVisible();
  });

  it("preserves time-proportional positioning for free-standing events", () => {
    // No containing blocks — events at evenly-spaced times keep equal pixel
    // deltas, confirming the time axis is undistorted.
    renderWithAuth(
      <TimelineList events={[bottle(1, "07:00"), bottle(2, "08:00"), bottle(3, "09:00")]} />,
    );
    const markers = screen.getAllByTestId("point-marker");
    const top1 = parseFloat((markers[0] as HTMLElement).style.top);
    const top2 = parseFloat((markers[1] as HTMLElement).style.top);
    const top3 = parseFloat((markers[2] as HTMLElement).style.top);
    expect(top2 - top1).toBe(top3 - top2);
  });

  it("renders point markers inside their containing block as compact chips", () => {
    // Wake, Bottle 1, and Pump all happen at 07:00, inside Wake Window 1
    // (07:00-08:25). They should each render with data-compact="true" and
    // distinct topPx (stacked inside the block, not overlapping).
    const pump: Event = {
      id: "p1",
      dayId: "d1",
      eventKey: "pump_07",
      type: "pump",
      label: "Pump",
      startTime: "07:00",
      source: "projected",
      status: "projected",
    };
    renderWithAuth(
      <TimelineList events={[wake(), wakeWindow(1, "07:00", "08:25"), bottle(1, "07:00"), pump]} />,
    );
    const chips = screen
      .getAllByTestId("point-marker")
      .filter((el) => el.getAttribute("data-compact") === "true");
    expect(chips).toHaveLength(3);
    const tops = chips.map((c) => parseFloat((c as HTMLElement).style.top)).sort((a, b) => a - b);
    expect(tops[1]!).toBeGreaterThan(tops[0]!);
    expect(tops[2]!).toBeGreaterThan(tops[1]!);
  });

  it("keeps the duration block at its natural time-anchored position", () => {
    // Even with chips inside, the block's topPx is purely time-based — the
    // time axis is not stretched by stacking.
    const pump: Event = {
      id: "p1",
      dayId: "d1",
      eventKey: "pump_07",
      type: "pump",
      label: "Pump",
      startTime: "07:30",
      source: "projected",
      status: "projected",
    };
    renderWithAuth(
      <TimelineList events={[wakeWindow(1, "07:00", "08:25"), nap(1, "08:25", "09:25"), pump]} />,
    );
    const blocks = screen.getAllByTestId("duration-block");
    const ww = blocks.find((b) => b.getAttribute("data-event-type") === "wake_window")!;
    const napBlock = blocks.find((b) => b.getAttribute("data-event-type") === "nap")!;
    const wwTop = parseFloat((ww as HTMLElement).style.top);
    const napTop = parseFloat((napBlock as HTMLElement).style.top);
    // 85 min between WW1 start and Nap 1 start; with PX_PER_MIN=2 → 170px.
    expect(napTop - wwTop).toBe(170);
  });

  it("renders free-standing point markers (no block container) without compact chrome", () => {
    renderWithAuth(<TimelineList events={[bottle(1, "13:00")]} />);
    const marker = screen.getByTestId("point-marker");
    expect(marker.getAttribute("data-compact")).toBe("false");
  });

  it("scrolls to the in-progress event when scrollToNowOnMount is true", () => {
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderWithAuth(
      <TimelineList
        events={[bottle(1, "07:00"), nap(1, "09:00", "10:00")]}
        nowMinutes={9 * 60 + 30}
        scrollToNowOnMount
      />,
    );
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    scrollSpy.mockRestore();
  });

  it("does not scroll when scrollToNowOnMount is omitted", () => {
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderWithAuth(<TimelineList events={[bottle(1, "07:00")]} nowMinutes={8 * 60} />);
    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });
});
