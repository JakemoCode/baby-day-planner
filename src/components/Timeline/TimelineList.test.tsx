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
});
