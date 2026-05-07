import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, fireEvent, userEvent } from "@/test-utils";
import { NapDefaultsEditor, type NapDefaults } from "./NapDefaultsEditor";

const baseValue: NapDefaults = {
  defaultNapLengthMinutes: 60,
  shortNapThresholdMinutes: 35,
  shortNapAdjustmentMinutes: 10,
  bedtimeThreshold: "19:00",
  putdownLeadMinutes: 15,
};

describe("NapDefaultsEditor", () => {
  it("renders all five fields with current values", () => {
    renderWithAuth(<NapDefaultsEditor value={baseValue} onChange={() => {}} />);
    expect(screen.getByLabelText(/default nap length/i)).toHaveValue("1:00");
    expect(screen.getByLabelText(/short nap threshold/i)).toHaveValue("0:35");
    expect(screen.getByLabelText(/short nap adjustment/i)).toHaveValue("0:10");
    expect(screen.getByLabelText(/bedtime threshold/i)).toHaveValue("19:00");
    expect(screen.getByLabelText(/putdown lead/i)).toHaveValue("0:15");
  });

  it("calls onChange when default nap length is edited", async () => {
    const onChange = vi.fn();
    renderWithAuth(<NapDefaultsEditor value={baseValue} onChange={onChange} />);
    const input = screen.getByLabelText(/default nap length/i);
    await userEvent.clear(input);
    await userEvent.type(input, "1:30");
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ defaultNapLengthMinutes: 90 }));
  });

  it("calls onChange when bedtime threshold is edited", () => {
    const onChange = vi.fn();
    renderWithAuth(<NapDefaultsEditor value={baseValue} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/bedtime threshold/i), {
      target: { value: "20:00" },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ bedtimeThreshold: "20:00" }));
  });
});
