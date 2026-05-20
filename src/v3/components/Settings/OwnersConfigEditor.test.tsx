/**
 * OwnersConfigEditor — V3-only. No V2 equivalent because V2 hardcoded
 * "Jake/Kelly/Daycare" in OwnerPicker. V3 owners are user-editable
 * (REQUIREMENTS §1.7) and drive the OwnerPicker options.
 *
 * §F4 (2026-05-20): per-owner Color hex inputs removed. Owner colors are
 * now slot-keyed via tokens (see ownerColor()); identity-only here.
 */

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OwnersConfig } from "../../schemas";
import { OwnersConfigEditor } from "./OwnersConfigEditor";

/** Stateful wrapper so controlled inputs reflect typed characters in tests. */
function Harness({
  initial,
  onChange,
}: {
  initial: OwnersConfig;
  onChange?: (next: OwnersConfig) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <OwnersConfigEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const owners = (overrides: Partial<OwnersConfig> = {}): OwnersConfig => ({
  parent1: { displayName: "Jake" },
  parent2: { displayName: "Sam" },
  other: [],
  ...overrides,
});

describe("OwnersConfigEditor", () => {
  it("renders parent1 and parent2 displayName inputs (no color field)", () => {
    render(<OwnersConfigEditor value={owners()} onChange={() => {}} />);
    expect(screen.getByLabelText("Parent 1 name")).toHaveValue("Jake");
    expect(screen.getByLabelText("Parent 2 name")).toHaveValue("Sam");
    // Color input is gone post-§F4.
    expect(document.getElementById("parent1-color")).toBeNull();
    expect(document.getElementById("parent2-color")).toBeNull();
  });

  it("emits the updated config when parent1 name changes", async () => {
    const onChange = vi.fn();
    render(<Harness initial={owners()} onChange={onChange} />);
    const input = screen.getByLabelText("Parent 1 name");
    await userEvent.clear(input);
    await userEvent.type(input, "Jacob");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ parent1: { displayName: "Jacob" } }),
    );
  });

  it("renders an Add other caregiver button when no others exist", () => {
    render(<OwnersConfigEditor value={owners()} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /add.*caregiver/i })).toBeInTheDocument();
  });

  it("clicking Add appends a new other caregiver with a generated id and empty name (no color)", async () => {
    const onChange = vi.fn();
    render(<OwnersConfigEditor value={owners()} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /add.*caregiver/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as OwnersConfig;
    expect(next.other).toHaveLength(1);
    expect(next.other[0]?.id).toMatch(/^other_/);
    expect(next.other[0]?.displayName).toBe("");
    expect(next.other[0]?.color).toBeUndefined();
  });

  it("renders one row per existing other owner", () => {
    const value = owners({
      other: [
        { id: "daycare", displayName: "Daycare" },
        { id: "grandma", displayName: "Grandma" },
      ],
    });
    render(<OwnersConfigEditor value={value} onChange={() => {}} />);
    expect(screen.getByDisplayValue("Daycare")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Grandma")).toBeInTheDocument();
  });

  it("editing an other owner's name emits the updated config preserving id", async () => {
    const onChange = vi.fn();
    const initial = owners({
      other: [{ id: "daycare", displayName: "Daycare" }],
    });
    render(<Harness initial={initial} onChange={onChange} />);
    const input = screen.getByDisplayValue("Daycare");
    await userEvent.clear(input);
    await userEvent.type(input, "Nursery");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        other: [{ id: "daycare", displayName: "Nursery" }],
      }),
    );
  });

  it("removing an other owner drops it from the list", async () => {
    const onChange = vi.fn();
    const value = owners({
      other: [
        { id: "daycare", displayName: "Daycare" },
        { id: "grandma", displayName: "Grandma" },
      ],
    });
    render(<OwnersConfigEditor value={value} onChange={onChange} />);
    const removeBtns = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removeBtns[0]!);
    const next = onChange.mock.calls[0]![0] as OwnersConfig;
    expect(next.other).toHaveLength(1);
    expect(next.other[0]?.id).toBe("grandma");
  });
});
