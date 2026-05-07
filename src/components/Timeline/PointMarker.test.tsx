import { describe, it, expect, vi } from "vitest";
import type { Event } from "@/domain";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import { PointMarker } from "./PointMarker";

const bottle = (overrides: Partial<Event> = {}): Event => ({
  id: "b1",
  dayId: "d1",
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  label: "Bottle 1",
  startTime: "07:05",
  amountOz: 5,
  source: "actual",
  status: "actual",
  ...overrides,
});

describe("PointMarker", () => {
  it("positions itself at topPx", () => {
    const { container } = renderWithAuth(<PointMarker event={bottle()} topPx={250} />);
    const marker = container.querySelector("[data-testid='point-marker']") as HTMLElement;
    expect(marker.style.top).toBe("250px");
  });

  it("shows the time and label", () => {
    renderWithAuth(<PointMarker event={bottle()} topPx={0} />);
    expect(screen.getByText("7:05 AM")).toBeVisible();
    expect(screen.getByText(/Bottle 1/)).toBeVisible();
  });

  it("includes amount oz subtitle for bottles", () => {
    renderWithAuth(<PointMarker event={bottle({ amountOz: 5.5 })} topPx={0} />);
    expect(screen.getByText(/5.5 oz/)).toBeVisible();
  });

  it("includes owner when set", () => {
    renderWithAuth(<PointMarker event={bottle({ owner: "Kelly" })} topPx={0} />);
    expect(screen.getByText(/kelly/i)).toBeVisible();
  });

  it("calls onClick when tapped", async () => {
    const onClick = vi.fn();
    renderWithAuth(<PointMarker event={bottle()} topPx={0} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("includes type-specific data attribute", () => {
    const { container } = renderWithAuth(
      <PointMarker
        event={{
          ...bottle(),
          type: "bedtime",
          kind: "instant",
          label: "Bedtime",
          eventKey: "bedtime",
        }}
        topPx={0}
      />,
    );
    expect(container.querySelector("[data-event-type='bedtime']")).not.toBeNull();
  });

  it("applies projected vs actual data-source attribute", () => {
    const { container: actualCt } = renderWithAuth(
      <PointMarker event={bottle({ source: "actual" })} topPx={0} />,
    );
    expect(actualCt.querySelector("[data-source='actual']")).not.toBeNull();

    const { container: projCt } = renderWithAuth(
      <PointMarker event={bottle({ source: "projected", status: "projected" })} topPx={0} />,
    );
    expect(projCt.querySelector("[data-source='projected']")).not.toBeNull();
  });
});
