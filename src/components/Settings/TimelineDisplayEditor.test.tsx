import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, fireEvent } from "@/test-utils";
import { TimelineDisplayEditor, type TimelineDisplay } from "./TimelineDisplayEditor";

const baseValue: TimelineDisplay = {
  colorMode: "type",
  pxPerHour: 120,
  dimPast: true,
};

describe("TimelineDisplayEditor", () => {
  it("renders all three controls reflecting the current values", () => {
    renderWithAuth(<TimelineDisplayEditor value={baseValue} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: /event type/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /owner/i })).not.toBeChecked();
    expect(screen.getByLabelText(/hour height/i)).toHaveValue("120");
    expect(screen.getByRole("checkbox", { name: /dim past events/i })).toBeChecked();
  });

  it("flips colorMode when the owner radio is selected", () => {
    const onChange = vi.fn();
    renderWithAuth(<TimelineDisplayEditor value={baseValue} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /owner/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ colorMode: "owner" }));
  });

  it("emits a numeric pxPerHour from the slider", () => {
    const onChange = vi.fn();
    renderWithAuth(<TimelineDisplayEditor value={baseValue} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/hour height/i), { target: { value: "180" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pxPerHour: 180 }));
  });

  it("toggles dimPast", () => {
    const onChange = vi.fn();
    renderWithAuth(<TimelineDisplayEditor value={baseValue} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /dim past events/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dimPast: false }));
  });
});
