import { describe, it, expect, vi } from "vitest";
import type { Event, OwnershipTemplate } from "@/domain";
import { renderWithAuth, screen, userEvent, fireEvent } from "@/test-utils";
import { TomorrowForm, type TomorrowFormState } from "./TomorrowForm";

const TEMPLATES: OwnershipTemplate[] = [
  {
    id: "tmpl-saturday",
    label: "Saturday",
    napOwners: ["Kelly", "Jake"],
    wakeWindowOwners: ["Jake", "Kelly"],
  },
  {
    id: "tmpl-sunday",
    label: "Sunday",
    napOwners: ["Jake", "Kelly"],
    wakeWindowOwners: ["Kelly", "Jake"],
  },
];

const baseValue = (overrides: Partial<TomorrowFormState> = {}): TomorrowFormState => ({
  wakeTime: "07:00",
  extras: [],
  ...overrides,
});

const extra = (overrides: Partial<Event> = {}): Event => ({
  id: "ex-1",
  dayId: "tomorrow",
  eventKey: "extra_1",
  type: "extra",
  label: "Pediatrician",
  startTime: "11:00",
  source: "manual",
  status: "completed",
  ...overrides,
});

describe("TomorrowForm", () => {
  it("renders the wake time field with current value", () => {
    renderWithAuth(
      <TomorrowForm
        value={baseValue({ wakeTime: "07:15" })}
        templates={TEMPLATES}
        onChange={() => {}}
        onAddExtra={() => {}}
        onEditExtra={() => {}}
        onRemoveExtra={() => {}}
      />,
    );
    expect(screen.getByLabelText(/wake time/i)).toHaveValue("07:15");
  });

  it("calls onChange when wake time changes", () => {
    const onChange = vi.fn();
    renderWithAuth(
      <TomorrowForm
        value={baseValue({ wakeTime: "07:00" })}
        templates={TEMPLATES}
        onChange={onChange}
        onAddExtra={() => {}}
        onEditExtra={() => {}}
        onRemoveExtra={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/wake time/i), { target: { value: "08:00" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ wakeTime: "08:00" }));
  });

  it("renders optional Bottle 1 time field", () => {
    renderWithAuth(
      <TomorrowForm
        value={baseValue({ bottle1Time: "07:05" })}
        templates={TEMPLATES}
        onChange={() => {}}
        onAddExtra={() => {}}
        onEditExtra={() => {}}
        onRemoveExtra={() => {}}
      />,
    );
    expect(screen.getByLabelText(/bottle 1/i)).toHaveValue("07:05");
  });

  it("renders template select with options", () => {
    renderWithAuth(
      <TomorrowForm
        value={baseValue()}
        templates={TEMPLATES}
        onChange={() => {}}
        onAddExtra={() => {}}
        onEditExtra={() => {}}
        onRemoveExtra={() => {}}
      />,
    );
    const select = screen.getByLabelText(/template/i);
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /none/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /saturday/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /sunday/i })).toBeInTheDocument();
  });

  it("calls onChange when template changes", async () => {
    const onChange = vi.fn();
    renderWithAuth(
      <TomorrowForm
        value={baseValue()}
        templates={TEMPLATES}
        onChange={onChange}
        onAddExtra={() => {}}
        onEditExtra={() => {}}
        onRemoveExtra={() => {}}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/template/i), "tmpl-saturday");
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as TomorrowFormState;
    expect(lastCall.templateId).toBe("tmpl-saturday");
  });

  it("lists extras with their labels and times", () => {
    renderWithAuth(
      <TomorrowForm
        value={baseValue({
          extras: [extra({ label: "Pediatrician", startTime: "11:00" })],
        })}
        templates={TEMPLATES}
        onChange={() => {}}
        onAddExtra={() => {}}
        onEditExtra={() => {}}
        onRemoveExtra={() => {}}
      />,
    );
    expect(screen.getByText("Pediatrician")).toBeInTheDocument();
    expect(screen.getByText("11:00 AM")).toBeInTheDocument();
  });

  it("calls onAddExtra when + Add extra is tapped", async () => {
    const onAddExtra = vi.fn();
    renderWithAuth(
      <TomorrowForm
        value={baseValue()}
        templates={TEMPLATES}
        onChange={() => {}}
        onAddExtra={onAddExtra}
        onEditExtra={() => {}}
        onRemoveExtra={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /add extra/i }));
    expect(onAddExtra).toHaveBeenCalledTimes(1);
  });

  it("calls onEditExtra with the extra event when its row is tapped", async () => {
    const onEditExtra = vi.fn();
    renderWithAuth(
      <TomorrowForm
        value={baseValue({ extras: [extra({ id: "ex-1" })] })}
        templates={TEMPLATES}
        onChange={() => {}}
        onAddExtra={() => {}}
        onEditExtra={onEditExtra}
        onRemoveExtra={() => {}}
      />,
    );
    // Find the edit button by its visible text (not aria-label, which the
    // remove button also matches via "Remove Pediatrician").
    await userEvent.click(screen.getByText("Pediatrician"));
    expect(onEditExtra).toHaveBeenCalledTimes(1);
    expect(onEditExtra.mock.calls[0]?.[0]).toMatchObject({ id: "ex-1" });
  });

  it("calls onRemoveExtra with the id when the delete button is tapped", async () => {
    const onRemoveExtra = vi.fn();
    renderWithAuth(
      <TomorrowForm
        value={baseValue({ extras: [extra({ id: "ex-1" })] })}
        templates={TEMPLATES}
        onChange={() => {}}
        onAddExtra={() => {}}
        onEditExtra={() => {}}
        onRemoveExtra={onRemoveExtra}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /remove pediatrician/i }));
    expect(onRemoveExtra).toHaveBeenCalledWith("ex-1");
  });
});
