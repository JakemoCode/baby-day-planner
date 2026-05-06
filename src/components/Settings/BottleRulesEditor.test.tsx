import { describe, it, expect, vi } from "vitest";
import type { BottleRule } from "@/domain";
import { renderWithAuth, screen, userEvent, fireEvent } from "@/test-utils";
import { BottleRulesEditor, type BottleSettings } from "./BottleRulesEditor";

const baseValue: BottleSettings = {
  defaultBottleAmountOz: 5,
  defaultBottleIntervalMinutes: 180,
  bottleRules: [
    { minOz: 0, maxOz: 5.5, intervalMinutes: 150 },
    { minOz: 5.6, intervalMinutes: 180 },
  ],
};

describe("BottleRulesEditor", () => {
  it("renders default amount + default interval", () => {
    renderWithAuth(<BottleRulesEditor value={baseValue} onChange={() => {}} />);
    expect(screen.getByLabelText(/default amount/i)).toHaveValue(5);
    expect(screen.getByLabelText(/default interval/i)).toHaveValue(180);
  });

  it("renders one row per rule", () => {
    renderWithAuth(<BottleRulesEditor value={baseValue} onChange={() => {}} />);
    expect(screen.getAllByLabelText(/^min oz$/i)).toHaveLength(2);
  });

  it("calls onChange when a rule's interval is edited", () => {
    const onChange = vi.fn();
    renderWithAuth(<BottleRulesEditor value={baseValue} onChange={onChange} />);
    const intervalInputs = screen.getAllByLabelText(/^interval \(minutes\)$/i);
    fireEvent.change(intervalInputs[0] as HTMLElement, { target: { value: "165" } });
    const arg = onChange.mock.calls[0]?.[0] as BottleSettings;
    expect(arg.bottleRules[0]?.intervalMinutes).toBe(165);
  });

  it("appends a new rule when add is clicked", async () => {
    const onChange = vi.fn();
    renderWithAuth(<BottleRulesEditor value={baseValue} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /add rule/i }));
    const arg = onChange.mock.calls[0]?.[0] as BottleSettings;
    expect(arg.bottleRules).toHaveLength(3);
  });

  it("removes a rule when its remove button is tapped", async () => {
    const onChange = vi.fn();
    renderWithAuth(<BottleRulesEditor value={baseValue} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /remove rule 1/i }));
    const arg = onChange.mock.calls[0]?.[0] as BottleSettings;
    expect(arg.bottleRules).toHaveLength(1);
    expect(arg.bottleRules[0]?.minOz).toBe(5.6);
  });

  it("treats empty maxOz as open-ended (omits the field)", () => {
    const onChange = vi.fn();
    renderWithAuth(<BottleRulesEditor value={baseValue} onChange={onChange} />);
    const maxInputs = screen.getAllByLabelText(/^max oz/i);
    fireEvent.change(maxInputs[0] as HTMLElement, { target: { value: "" } });
    const arg = onChange.mock.calls[0]?.[0] as BottleSettings;
    const rule0 = arg.bottleRules[0] as BottleRule;
    expect(rule0.maxOz).toBeUndefined();
  });

  it("renders empty state when no rules configured", () => {
    renderWithAuth(
      <BottleRulesEditor value={{ ...baseValue, bottleRules: [] }} onChange={() => {}} />,
    );
    expect(screen.getByText(/no rules/i)).toBeVisible();
  });
});
