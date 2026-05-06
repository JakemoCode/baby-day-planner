import { describe, it, expect, vi } from "vitest";
import type { OwnershipTemplate } from "@/domain";
import { renderWithAuth, screen, userEvent, fireEvent } from "@/test-utils";
import { WeekendTemplateEditor } from "./WeekendTemplateEditor";

const saturday: OwnershipTemplate = {
  id: "tmpl-saturday",
  label: "Saturday",
  napOwners: ["Kelly", "Jake", "Kelly"],
  wakeWindowOwners: ["Jake", "Kelly", "Jake"],
};

const sunday: OwnershipTemplate = {
  id: "tmpl-sunday",
  label: "Sunday",
  napOwners: ["Jake", "Kelly", "Jake"],
  wakeWindowOwners: ["Kelly", "Jake", "Kelly"],
};

describe("WeekendTemplateEditor", () => {
  it("renders Saturday and Sunday sections", () => {
    renderWithAuth(
      <WeekendTemplateEditor
        saturday={saturday}
        sunday={sunday}
        slotCount={3}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: /saturday/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: /sunday/i })).toBeVisible();
  });

  it("renders one nap-owner select and one ww-owner select per slot per day", () => {
    renderWithAuth(
      <WeekendTemplateEditor
        saturday={saturday}
        sunday={sunday}
        slotCount={3}
        onChange={() => {}}
      />,
    );
    // 3 slots × 2 selects per slot × 2 days = 12 selects
    expect(screen.getAllByRole("combobox")).toHaveLength(12);
  });

  it("calls onChange when a Saturday nap owner is changed", () => {
    const onChange = vi.fn();
    renderWithAuth(
      <WeekendTemplateEditor
        saturday={saturday}
        sunday={sunday}
        slotCount={3}
        onChange={onChange}
      />,
    );
    const satNap1 = screen.getByLabelText(/saturday nap 1 owner/i);
    fireEvent.change(satNap1, { target: { value: "Daycare" } });
    expect(onChange).toHaveBeenCalled();
    const [nextSat] = onChange.mock.calls[0] ?? [];
    expect(nextSat.napOwners[0]).toBe("Daycare");
  });

  it("flip Saturday swaps Jake ↔ Kelly only", async () => {
    const onChange = vi.fn();
    renderWithAuth(
      <WeekendTemplateEditor
        saturday={saturday}
        sunday={sunday}
        slotCount={3}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /flip saturday/i }));
    const [nextSat] = onChange.mock.calls[0] ?? [];
    expect(nextSat.napOwners).toEqual(["Jake", "Kelly", "Jake"]);
  });

  it("copy Saturday → Sunday produces a flipped Sunday", async () => {
    const onChange = vi.fn();
    renderWithAuth(
      <WeekendTemplateEditor
        saturday={saturday}
        sunday={sunday}
        slotCount={3}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /copy saturday to sunday/i }));
    const [_, nextSun] = onChange.mock.calls[0] ?? [];
    // saturday napOwners ["Kelly","Jake","Kelly"] → flipped ["Jake","Kelly","Jake"]
    expect(nextSun.napOwners).toEqual(["Jake", "Kelly", "Jake"]);
    expect(nextSun.id).toBe("tmpl-sunday");
    expect(nextSun.label).toBe("Sunday");
  });
});
