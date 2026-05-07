import { describe, it, expect, vi } from "vitest";
import type { Event } from "@/domain";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import { TimelineList } from "./TimelineList";

const wake = (): Event => ({
  id: "w",
  dayId: "d1",
  eventKey: "wake",
  type: "wake",
  kind: "instant",
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
  kind: "block",
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
  kind: "block",
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
  kind: "instant",
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
      kind: "instant",
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
      kind: "instant",
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

  it("suppresses the wake event when a duration block starts at the same time", () => {
    // Wake always coincides with Wake Window 1 start — the chip is pure
    // redundancy, so the renderer drops it.
    renderWithAuth(<TimelineList events={[wake(), wakeWindow(1, "07:00", "08:25")]} />);
    expect(screen.queryByTestId("point-marker")).toBeNull();
    expect(screen.getByTestId("duration-block")).toBeVisible();
  });

  it("keeps a wake event that does not coincide with any block start", () => {
    renderWithAuth(<TimelineList events={[wake(), wakeWindow(1, "07:30", "08:25")]} />);
    expect(screen.getByTestId("point-marker")).toBeVisible();
  });

  it("abbreviates putdown labels in chip mode", () => {
    const putdown: Event = {
      id: "pd1",
      dayId: "d1",
      eventKey: "nap_1_putdown",
      type: "putdown",
      kind: "block",
      label: "Start putting down for Nap 1",
      startTime: "07:30",
      source: "projected",
      status: "projected",
    };
    renderWithAuth(<TimelineList events={[wakeWindow(1, "07:00", "08:25"), putdown]} />);
    const chip = screen.getByTestId("point-marker");
    expect(chip.getAttribute("data-compact")).toBe("true");
    expect(chip.textContent).toContain("Putdown · Nap 1");
    expect(chip.textContent).not.toContain("Start putting down");
  });

  it("keeps the full putdown label when not embedded in a block", () => {
    const putdown: Event = {
      id: "pd1",
      dayId: "d1",
      eventKey: "nap_1_putdown",
      type: "putdown",
      kind: "block",
      label: "Start putting down for Nap 1",
      startTime: "07:30",
      source: "projected",
      status: "projected",
    };
    renderWithAuth(<TimelineList events={[putdown]} />);
    const marker = screen.getByTestId("point-marker");
    expect(marker.getAttribute("data-compact")).toBe("false");
    expect(marker.textContent).toContain("Start putting down for Nap 1");
  });

  it("renders point markers inside their containing block as compact chips", () => {
    // Bottle 1 and Pump happen at 07:00, inside Wake Window 1 (07:00-08:25).
    // They should each render with data-compact="true" and distinct topPx
    // (stacked inside the block, not overlapping). Wake is intentionally
    // omitted because it would be suppressed by the WW1-coincidence rule.
    const pump: Event = {
      id: "p1",
      dayId: "d1",
      eventKey: "pump_07",
      type: "pump",
      kind: "instant",
      label: "Pump",
      startTime: "07:00",
      source: "projected",
      status: "projected",
    };
    renderWithAuth(
      <TimelineList events={[wakeWindow(1, "07:00", "08:25"), bottle(1, "07:00"), pump]} />,
    );
    const chips = screen
      .getAllByTestId("point-marker")
      .filter((el) => el.getAttribute("data-compact") === "true");
    expect(chips).toHaveLength(2);
    const tops = chips.map((c) => parseFloat((c as HTMLElement).style.top)).sort((a, b) => a - b);
    expect(tops[1]!).toBeGreaterThan(tops[0]!);
  });

  it("keeps the duration block at its natural time-anchored position", () => {
    // Even with chips inside, the block's topPx is purely time-based — the
    // time axis is not stretched by stacking.
    const pump: Event = {
      id: "p1",
      dayId: "d1",
      eventKey: "pump_07",
      type: "pump",
      kind: "instant",
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

  it("pushes a free-standing marker below a preceding block by at least 8px", () => {
    // Wake Window 1 ends at 08:25 (170px from 07:00 origin). A point marker
    // at 08:25 would naturally land at the same y as the block's bottom edge.
    // It should be pushed down by BLOCK_BOTTOM_GAP_PX (8) for breathing room.
    const bottleAtBlockEnd: Event = {
      id: "b-edge",
      dayId: "d1",
      eventKey: "bottle_edge",
      type: "bottle",
      kind: "instant",
      label: "Bottle",
      startTime: "08:25",
      amountOz: 5,
      source: "actual",
      status: "actual",
    };
    renderWithAuth(<TimelineList events={[wakeWindow(1, "07:00", "08:25"), bottleAtBlockEnd]} />);
    const block = screen.getByTestId("duration-block");
    const marker = screen.getByTestId("point-marker");
    const blockTop = parseFloat((block as HTMLElement).style.top);
    const blockHeight = parseFloat((block as HTMLElement).style.height);
    const markerTop = parseFloat((marker as HTMLElement).style.top);
    expect(markerTop).toBeGreaterThanOrEqual(blockTop + blockHeight + 8);
  });

  it("stacks consecutive free-standing markers so they don't overlap", () => {
    // Two free-standing markers very close in time but NOT both on the hour
    // (the on-the-hour case is handled by the compound-row collapse instead).
    const pump: Event = {
      id: "p1",
      dayId: "d1",
      eventKey: "pump_21",
      type: "pump",
      kind: "instant",
      label: "Pump",
      startTime: "21:05",
      source: "projected",
      status: "projected",
    };
    const dream: Event = {
      id: "df1",
      dayId: "d1",
      eventKey: "dream_feed",
      type: "dream_feed",
      kind: "instant",
      label: "Dream Feed",
      startTime: "21:05",
      source: "projected",
      status: "projected",
    };
    renderWithAuth(<TimelineList events={[pump, dream]} />);
    const markers = screen.getAllByTestId("point-marker");
    const tops = markers.map((m) => parseFloat((m as HTMLElement).style.top)).sort((a, b) => a - b);
    expect(tops[1]!).toBeGreaterThan(tops[0]!);
  });

  it("renders free-standing point markers (no block container) without compact chrome", () => {
    renderWithAuth(<TimelineList events={[bottle(1, "13:00")]} />);
    const marker = screen.getByTestId("point-marker");
    expect(marker.getAttribute("data-compact")).toBe("false");
  });

  it("anchors chips to their actual time within a containing block", () => {
    // Wake Window 1 spans 07:00–08:25 (170px tall). A pump at 08:00 is 60min
    // in, so its top should land near 120px below the block's top — NOT
    // immediately after the block header. Confirms chips honor the time axis.
    const pump: Event = {
      id: "p1",
      dayId: "d1",
      eventKey: "pump_08",
      type: "pump",
      kind: "instant",
      label: "Pump",
      startTime: "08:00",
      source: "projected",
      status: "projected",
    };
    renderWithAuth(<TimelineList events={[wakeWindow(1, "07:00", "08:25"), pump]} />);
    const block = screen.getByTestId("duration-block");
    const chip = screen.getByTestId("point-marker");
    const blockTop = parseFloat((block as HTMLElement).style.top);
    const chipTop = parseFloat((chip as HTMLElement).style.top);
    // 60 min × PX_PER_MIN(2) = 120px below block top.
    expect(chipTop - blockTop).toBe(120);
  });

  it("renders an hour-tick label and hairline for each whole hour in range", () => {
    // Span 07:00 – 09:00 → expect ticks for 7, 8, and 9 AM.
    renderWithAuth(<TimelineList events={[bottle(1, "07:00"), bottle(2, "09:00")]} />);
    expect(screen.getByText("7 AM")).toBeVisible();
    expect(screen.getByText("8 AM")).toBeVisible();
    expect(screen.getByText("9 AM")).toBeVisible();
  });

  it("formats afternoon hour ticks with PM and 12-hour clock", () => {
    renderWithAuth(<TimelineList events={[bottle(1, "12:30"), bottle(2, "14:30")]} />);
    expect(screen.getByText("1 PM")).toBeVisible();
    expect(screen.getByText("2 PM")).toBeVisible();
  });

  it("renders putdown events as duration blocks (engine emits endTime)", () => {
    const putdown: Event = {
      id: "pd1",
      dayId: "d1",
      eventKey: "nap_1_putdown",
      type: "putdown",
      kind: "block",
      label: "Start putting down for Nap 1",
      startTime: "08:10",
      endTime: "08:25",
      source: "projected",
      status: "projected",
    };
    renderWithAuth(<TimelineList events={[putdown]} />);
    expect(screen.getByTestId("duration-block")).toBeVisible();
    expect(screen.queryByTestId("point-marker")).toBeNull();
  });

  it("collapses 2-3 free-standing on-the-hour markers into a compound row", () => {
    const pump: Event = {
      id: "p1",
      dayId: "d1",
      eventKey: "pump_21",
      type: "pump",
      kind: "instant",
      label: "Pump",
      startTime: "21:00",
      source: "projected",
      status: "projected",
    };
    const dream: Event = {
      id: "df1",
      dayId: "d1",
      eventKey: "dream_feed",
      type: "dream_feed",
      kind: "instant",
      label: "Dream Feed",
      startTime: "21:00",
      source: "projected",
      status: "projected",
    };
    renderWithAuth(<TimelineList events={[pump, dream]} />);
    const row = screen.getByTestId("compound-hour-row");
    expect(row).toBeVisible();
    expect(row.textContent).toContain("Pump · Dream Feed");
    expect(screen.queryByTestId("point-marker")).toBeNull();
  });

  it("falls back to individual markers when 4+ events share an hour", () => {
    const make = (n: number): Event => ({
      id: `e${n}`,
      dayId: "d1",
      eventKey: `pump_${n}`,
      type: "pump",
      kind: "instant",
      label: `Pump ${n}`,
      startTime: "21:00",
      source: "projected",
      status: "projected",
    });
    renderWithAuth(<TimelineList events={[make(1), make(2), make(3), make(4)]} />);
    expect(screen.queryByTestId("compound-hour-row")).toBeNull();
    expect(screen.getAllByTestId("point-marker")).toHaveLength(4);
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
