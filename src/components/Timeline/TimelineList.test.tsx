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

  it("positions later events with a higher topPx than earlier events", () => {
    renderWithAuth(<TimelineList events={[bottle(1, "07:00"), bottle(2, "10:00")]} />);
    const markers = screen.getAllByTestId("point-marker");
    const top1 = parseFloat((markers[0] as HTMLElement).style.top);
    const top2 = parseFloat((markers[1] as HTMLElement).style.top);
    expect(top2).toBeGreaterThan(top1);
  });

  it("stacks same-time events vertically instead of overlapping", () => {
    renderWithAuth(<TimelineList events={[wake(), bottle(1, "07:00"), bottle(2, "07:00")]} />);
    const markers = screen.getAllByTestId("point-marker");
    const tops = markers.map((m) => parseFloat((m as HTMLElement).style.top)).sort((a, b) => a - b);
    // All three start at 07:00 so naively they would share the same topPx;
    // each subsequent event should be offset further down.
    expect(tops[0]).toBe(tops[0]);
    expect(tops[1]!).toBeGreaterThan(tops[0]!);
    expect(tops[2]!).toBeGreaterThan(tops[1]!);
  });

  it("does not stack events that are well-separated in time", () => {
    renderWithAuth(
      <TimelineList events={[bottle(1, "07:00"), bottle(2, "08:00"), bottle(3, "09:00")]} />,
    );
    const markers = screen.getAllByTestId("point-marker");
    // With 60-min gaps, each marker keeps its natural time-anchored position
    // (no stack offset added).
    const top1 = parseFloat((markers[0] as HTMLElement).style.top);
    const top2 = parseFloat((markers[1] as HTMLElement).style.top);
    const top3 = parseFloat((markers[2] as HTMLElement).style.top);
    // Equal time deltas → equal pixel deltas (no stacking) confirms no offset crept in.
    expect(top2 - top1).toBe(top3 - top2);
  });

  it("pushes a later event past a same-time stack instead of into it", () => {
    // Mirrors the screenshot Jake shared: a stacked cluster at 1:00 PM
    // (Bottle + Pump) followed by an event at 1:20 PM. The 1:20 event must
    // render BELOW the bottom of the stacked cluster, not at its naive
    // time-anchored position which would land inside it.
    const pump: Event = {
      id: "p1",
      dayId: "d1",
      eventKey: "pump_13",
      type: "pump",
      label: "Pump",
      startTime: "13:00",
      source: "projected",
      status: "projected",
    };
    renderWithAuth(<TimelineList events={[bottle(3, "13:00"), pump, nap(3, "13:20", "14:05")]} />);
    const tops = screen
      .getAllByTestId(/point-marker|duration-block/)
      .map((el) => ({
        type: el.getAttribute("data-event-type"),
        top: parseFloat((el as HTMLElement).style.top),
      }))
      .sort((a, b) => a.top - b.top);
    // Strictly increasing — frontier guarantees no two events share the same y
    // even when the third event's natural time-anchor would put it inside
    // the rendered area of the prior cluster.
    expect(tops[1]!.top).toBeGreaterThan(tops[0]!.top);
    expect(tops[2]!.top).toBeGreaterThan(tops[1]!.top);
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

  it("does not scroll when scrollToNowOnMount is false", () => {
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderWithAuth(<TimelineList events={[bottle(1, "07:00")]} nowMinutes={8 * 60} />);
    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });
});
