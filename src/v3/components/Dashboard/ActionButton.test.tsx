import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionButton } from "./ActionButton";

describe("ActionButton", () => {
  it("renders children inside a button", () => {
    render(
      <ActionButton variant="primary" onClick={() => {}}>
        Start Day
      </ActionButton>,
    );
    expect(screen.getByRole("button", { name: /start day/i })).toBeVisible();
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(
      <ActionButton variant="secondary" onClick={onClick}>
        Start Nap
      </ActionButton>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("respects disabled prop", async () => {
    const onClick = vi.fn();
    render(
      <ActionButton variant="primary" onClick={onClick} disabled>
        Start
      </ActionButton>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies the secondary variant class", () => {
    render(
      <ActionButton variant="secondary" onClick={() => {}}>
        Secondary
      </ActionButton>,
    );
    expect(screen.getByRole("button").className).toMatch(/secondary/);
  });

  it("applies the danger variant class", () => {
    render(
      <ActionButton variant="danger" onClick={() => {}}>
        Danger
      </ActionButton>,
    );
    expect(screen.getByRole("button").className).toMatch(/danger/);
  });

  it("merges optional className", () => {
    render(
      <ActionButton variant="primary" onClick={() => {}} className="extra-class">
        Btn
      </ActionButton>,
    );
    expect(screen.getByRole("button").className).toMatch(/extra-class/);
  });

  it("forwards aria-live when provided", () => {
    render(
      <ActionButton variant="primary" onClick={() => {}} aria-live="polite">
        Btn
      </ActionButton>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-live", "polite");
  });
});
