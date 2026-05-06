import { describe, it, expect, vi } from "vitest";
import type { Event } from "@/domain";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import { DurationBlock } from "./DurationBlock";

const nap = (overrides: Partial<Event> = {}): Event => ({
  id: "nap1",
  dayId: "d1",
  eventKey: "nap_1",
  type: "nap",
  label: "Nap 1",
  startTime: "09:00",
  endTime: "10:00",
  source: "projected",
  status: "projected",
  ...overrides,
});

describe("DurationBlock", () => {
  it("positions itself at the given topPx with heightPx", () => {
    const { container } = renderWithAuth(
      <DurationBlock event={nap()} topPx={200} heightPx={120} />,
    );
    const block = container.querySelector("[data-testid='duration-block']") as HTMLElement;
    expect(block.style.top).toBe("200px");
    expect(block.style.height).toBe("120px");
  });

  it("shows the label and time range", () => {
    renderWithAuth(<DurationBlock event={nap()} topPx={0} heightPx={120} />);
    expect(screen.getByText("Nap 1")).toBeInTheDocument();
    expect(screen.getByText(/9:00.*10:00/i)).toBeInTheDocument();
  });

  it("includes owner when assigned", () => {
    renderWithAuth(<DurationBlock event={nap({ owner: "Kelly" })} topPx={0} heightPx={120} />);
    expect(screen.getByText(/kelly/i)).toBeInTheDocument();
  });

  it("calls onClick when tapped", async () => {
    const onClick = vi.fn();
    renderWithAuth(<DurationBlock event={nap()} topPx={0} heightPx={120} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders as static (non-button) when no onClick provided", () => {
    renderWithAuth(<DurationBlock event={nap()} topPx={0} heightPx={120} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("includes type-specific data attribute for styling", () => {
    const { container: napCt } = renderWithAuth(
      <DurationBlock event={nap()} topPx={0} heightPx={120} />,
    );
    expect(napCt.querySelector("[data-event-type='nap']")).not.toBeNull();

    const ww: Event = {
      ...nap(),
      type: "wake_window",
      eventKey: "wake_window_1",
      label: "Wake Window 1",
    };
    const { container: wwCt } = renderWithAuth(
      <DurationBlock event={ww} topPx={0} heightPx={120} />,
    );
    expect(wwCt.querySelector("[data-event-type='wake_window']")).not.toBeNull();
  });

  it("marks actual events with data-source attribute", () => {
    const { container } = renderWithAuth(
      <DurationBlock
        event={nap({ source: "actual", status: "actual" })}
        topPx={0}
        heightPx={120}
      />,
    );
    expect(container.querySelector("[data-source='actual']")).not.toBeNull();
  });
});
