import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test-utils";
import { FABTypePicker } from "./FABTypePicker";

describe("FABTypePicker", () => {
  it("renders nothing when closed", () => {
    render(<FABTypePicker open={false} onSelect={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders all four options when open", () => {
    render(<FABTypePicker open onSelect={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: /bottle/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /nap/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /pump/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /custom/i })).toBeVisible();
  });

  it("invokes onSelect with the chosen type", async () => {
    const onSelect = vi.fn();
    render(<FABTypePicker open onSelect={onSelect} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /pump/i }));
    expect(onSelect).toHaveBeenCalledWith("pump");
  });

  it("calls onCancel when the Cancel button is tapped", async () => {
    const onCancel = vi.fn();
    render(<FABTypePicker open onSelect={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Escape is pressed", async () => {
    const onCancel = vi.fn();
    render(<FABTypePicker open onSelect={() => {}} onCancel={onCancel} />);
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("maps Custom to type 'extra'", async () => {
    const onSelect = vi.fn();
    render(<FABTypePicker open onSelect={onSelect} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /custom/i }));
    expect(onSelect).toHaveBeenCalledWith("extra");
  });
});
