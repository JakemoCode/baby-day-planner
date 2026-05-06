import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, userEvent, fireEvent } from "@/test-utils";
import { PumpTimesEditor } from "./PumpTimesEditor";

describe("PumpTimesEditor", () => {
  it("renders one time input per pump time", () => {
    renderWithAuth(<PumpTimesEditor value={["10:30", "14:30"]} onChange={() => {}} />);
    expect(screen.getAllByLabelText(/^pump time \d+$/i)).toHaveLength(2);
  });

  it("calls onChange when a time is edited", () => {
    const onChange = vi.fn();
    renderWithAuth(<PumpTimesEditor value={["10:30", "14:30"]} onChange={onChange} />);
    const inputs = screen.getAllByLabelText(/^pump time \d+$/i);
    fireEvent.change(inputs[0] as HTMLElement, { target: { value: "11:00" } });
    expect(onChange).toHaveBeenCalledWith(["11:00", "14:30"]);
  });

  it("appends '12:00' as default when add is clicked", async () => {
    const onChange = vi.fn();
    renderWithAuth(<PumpTimesEditor value={["10:30"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /add pump time/i }));
    expect(onChange).toHaveBeenCalledWith(["10:30", "12:00"]);
  });

  it("removes a time at the given index", async () => {
    const onChange = vi.fn();
    renderWithAuth(<PumpTimesEditor value={["10:30", "14:30"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /remove pump time 1/i }));
    expect(onChange).toHaveBeenCalledWith(["14:30"]);
  });

  it("renders empty state when no times configured", () => {
    renderWithAuth(<PumpTimesEditor value={[]} onChange={() => {}} />);
    expect(screen.getByText(/no pump times/i)).toBeVisible();
  });
});
