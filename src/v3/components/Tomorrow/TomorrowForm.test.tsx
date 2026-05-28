/**
 * TomorrowForm — slot-aware plan form. wakeTime is TimeMin on the value object;
 * templateId picker uses OwnershipTemplate.displayName. Bottle/extras flows are
 * at the page level, not in the form.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OwnershipTemplate } from "../../schemas";
import { TomorrowForm, type TomorrowFormValue } from "./TomorrowForm";

const TEMPLATES: OwnershipTemplate[] = [
  {
    id: "tmpl-saturday",
    displayName: "Saturday",
    napOwners: [{ slot: "parent1" }, { slot: "parent2" }],
    wakeWindowOwners: [{ slot: "parent2" }, { slot: "parent1" }],
  },
  {
    id: "tmpl-sunday",
    displayName: "Sunday",
    napOwners: [{ slot: "parent2" }, { slot: "parent1" }],
    wakeWindowOwners: [{ slot: "parent1" }, { slot: "parent2" }],
  },
];

const baseValue = (overrides: Partial<TomorrowFormValue> = {}): TomorrowFormValue => ({
  wakeTime: 7 * 60,
  ...overrides,
});

describe("TomorrowForm (V3)", () => {
  it("renders wakeTime as HH:MM in the time input", () => {
    render(
      <TomorrowForm
        value={baseValue({ wakeTime: 7 * 60 + 15 })}
        templates={TEMPLATES}
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText(/wake time/i)).toHaveValue("07:15");
  });

  it("emits a TimeMin number when the wake time changes", () => {
    const onChange = vi.fn();
    render(
      <TomorrowForm
        value={baseValue({ wakeTime: 7 * 60 })}
        templates={TEMPLATES}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/wake time/i), { target: { value: "08:30" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ wakeTime: 8 * 60 + 30 }));
  });

  it("renders a template picker with one option per template", () => {
    render(<TomorrowForm value={baseValue()} templates={TEMPLATES} onChange={() => {}} />);
    const select = screen.getByLabelText(/template/i);
    expect(select).toBeVisible();
    expect(screen.getByRole("option", { name: /none/i })).toBeVisible();
    expect(screen.getByRole("option", { name: /saturday/i })).toBeVisible();
    expect(screen.getByRole("option", { name: /sunday/i })).toBeVisible();
  });

  it("emits the selected templateId on change", async () => {
    const onChange = vi.fn();
    render(<TomorrowForm value={baseValue()} templates={TEMPLATES} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText(/template/i), "tmpl-saturday");
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as TomorrowFormValue;
    expect(lastCall.templateId).toBe("tmpl-saturday");
  });

  it("clears templateId when 'None' is selected", async () => {
    const onChange = vi.fn();
    render(
      <TomorrowForm
        value={baseValue({ templateId: "tmpl-saturday" })}
        templates={TEMPLATES}
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/template/i), "");
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as TomorrowFormValue;
    expect(lastCall.templateId).toBeUndefined();
  });

  it("omits the template picker when no templates are supplied", () => {
    render(<TomorrowForm value={baseValue()} templates={[]} onChange={() => {}} />);
    expect(screen.queryByLabelText(/template/i)).toBeNull();
  });
});
