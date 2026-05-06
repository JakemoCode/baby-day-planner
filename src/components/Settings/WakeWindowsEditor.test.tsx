import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, userEvent, fireEvent } from "@/test-utils";
import { WakeWindowsEditor } from "./WakeWindowsEditor";

describe("WakeWindowsEditor", () => {
  it("renders one row per wake window", () => {
    renderWithAuth(<WakeWindowsEditor value={[120, 135, 135, 150]} onChange={() => {}} />);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(4);
  });

  it("calls onChange with the new array when a value is edited", () => {
    const onChange = vi.fn();
    renderWithAuth(<WakeWindowsEditor value={[120, 135, 135, 150]} onChange={onChange} />);
    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[1] as HTMLElement, { target: { value: "150" } });
    expect(onChange).toHaveBeenCalledWith([120, 150, 135, 150]);
  });

  it("appends a window when add is clicked", async () => {
    const onChange = vi.fn();
    renderWithAuth(<WakeWindowsEditor value={[120, 135]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /add window/i }));
    const arg = onChange.mock.calls[0]?.[0] as number[];
    expect(arg).toHaveLength(3);
    expect(arg.slice(0, 2)).toEqual([120, 135]);
  });

  it("removes a window when its remove button is tapped", async () => {
    const onChange = vi.fn();
    renderWithAuth(<WakeWindowsEditor value={[120, 135, 135, 150]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /remove wake window 2/i }));
    expect(onChange).toHaveBeenCalledWith([120, 135, 150]);
  });

  it("renders empty-state copy when value is empty", () => {
    renderWithAuth(<WakeWindowsEditor value={[]} onChange={() => {}} />);
    expect(screen.getByText(/no wake windows/i)).toBeVisible();
  });
});
