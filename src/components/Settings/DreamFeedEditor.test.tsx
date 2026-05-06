import { describe, it, expect, vi } from "vitest";
import type { DreamFeedSettings } from "@/domain";
import { renderWithAuth, screen, fireEvent } from "@/test-utils";
import { DreamFeedEditor } from "./DreamFeedEditor";

const baseValue: DreamFeedSettings = {
  enabled: true,
  earliestTime: "20:30",
  latestTime: "21:00",
  minMinutesAfterBedtime: 90,
};

describe("DreamFeedEditor", () => {
  it("renders the enabled toggle and time fields", () => {
    renderWithAuth(<DreamFeedEditor value={baseValue} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: /enabled/i })).toBeChecked();
    expect(screen.getByLabelText(/earliest time/i)).toHaveValue("20:30");
    expect(screen.getByLabelText(/latest time/i)).toHaveValue("21:00");
    expect(screen.getByLabelText(/minimum minutes after bedtime/i)).toHaveValue(90);
  });

  it("disables time fields when not enabled", () => {
    renderWithAuth(
      <DreamFeedEditor value={{ ...baseValue, enabled: false }} onChange={() => {}} />,
    );
    expect(screen.getByLabelText(/earliest time/i)).toBeDisabled();
    expect(screen.getByLabelText(/latest time/i)).toBeDisabled();
    expect(screen.getByLabelText(/minimum minutes after bedtime/i)).toBeDisabled();
  });

  it("calls onChange when toggle is flipped", () => {
    const onChange = vi.fn();
    renderWithAuth(<DreamFeedEditor value={baseValue} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /enabled/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("calls onChange when earliestTime changes", () => {
    const onChange = vi.fn();
    renderWithAuth(<DreamFeedEditor value={baseValue} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/earliest time/i), {
      target: { value: "20:45" },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ earliestTime: "20:45" }));
  });
});
