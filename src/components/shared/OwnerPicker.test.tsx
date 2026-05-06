import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import { OwnerPicker } from "./OwnerPicker";

describe("OwnerPicker", () => {
  it("renders four options: None, Jake, Kelly, Daycare", () => {
    renderWithAuth(<OwnerPicker value={undefined} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "None" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Jake" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Kelly" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Daycare" })).toBeVisible();
  });

  it("marks the current value with aria-pressed=true", () => {
    renderWithAuth(<OwnerPicker value="Jake" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Jake" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Kelly" })).toHaveAttribute("aria-pressed", "false");
  });

  it("treats undefined value as the 'None' option being active", () => {
    renderWithAuth(<OwnerPicker value={undefined} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "true");
  });

  it("invokes onChange with the selected owner", async () => {
    const onChange = vi.fn();
    renderWithAuth(<OwnerPicker value={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Kelly" }));
    expect(onChange).toHaveBeenCalledWith("Kelly");
  });

  it("invokes onChange(undefined) when None is tapped", async () => {
    const onChange = vi.fn();
    renderWithAuth(<OwnerPicker value="Jake" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "None" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("supports a label", () => {
    renderWithAuth(<OwnerPicker value={undefined} onChange={() => {}} label="Owner" />);
    expect(screen.getByText("Owner")).toBeVisible();
  });
});
