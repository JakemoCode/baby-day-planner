/**
 * OwnerPickerV3 — slot-based picker driven by Settings.owners.
 *
 * Differences from V2 OwnerPicker:
 *   - Options are derived from OwnersConfig at render time (not hardcoded)
 *   - Display strings come from `displayName` (renames don't rewrite events)
 *   - "None" still selectable to clear an annotation
 *   - selected state compares slot identity via ownerRefEquals, not strings
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OwnersConfig } from "../../schemas";
import { OwnerPickerV3 } from "./OwnerPickerV3";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [
    { id: "daycare", displayName: "Daycare", color: "#ccc" },
    { id: "grandma", displayName: "Grandma", color: "#fa0" },
  ],
};

describe("OwnerPickerV3", () => {
  it("renders one option per parent + each other owner + None", () => {
    render(<OwnerPickerV3 owners={owners} value={undefined} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "None" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jake" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sam" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Daycare" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grandma" })).toBeInTheDocument();
  });

  it("marks the selected slot as aria-pressed", () => {
    render(<OwnerPickerV3 owners={owners} value={{ slot: "parent1" }} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Jake" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sam" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks the selected other-slot via otherId match", () => {
    render(
      <OwnerPickerV3
        owners={owners}
        value={{ slot: "other", otherId: "grandma" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Grandma" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Daycare" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("clicking a parent emits the parent OwnerRef", async () => {
    const onChange = vi.fn();
    render(<OwnerPickerV3 owners={owners} value={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Sam" }));
    expect(onChange).toHaveBeenCalledWith({ slot: "parent2" });
  });

  it("clicking an other-owner emits the other OwnerRef with otherId", async () => {
    const onChange = vi.fn();
    render(<OwnerPickerV3 owners={owners} value={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Daycare" }));
    expect(onChange).toHaveBeenCalledWith({ slot: "other", otherId: "daycare" });
  });

  it("clicking None emits undefined to clear the ref", async () => {
    const onChange = vi.fn();
    render(<OwnerPickerV3 owners={owners} value={{ slot: "parent1" }} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "None" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("encodes slot key on data-owner so existing CSS selectors keep working", () => {
    render(<OwnerPickerV3 owners={owners} value={undefined} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Jake" })).toHaveAttribute("data-owner", "parent1");
    expect(screen.getByRole("button", { name: "Daycare" })).toHaveAttribute(
      "data-owner",
      "other:daycare",
    );
  });
});
