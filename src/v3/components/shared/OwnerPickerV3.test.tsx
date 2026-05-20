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
import { NO_OWNER, type OwnersConfig } from "../../schemas";
import { OwnerPickerV3 } from "./OwnerPickerV3";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake" },
  parent2: { displayName: "Sam" },
  other: [
    { id: "daycare", displayName: "Daycare" },
    { id: "grandma", displayName: "Grandma" },
  ],
};

describe("OwnerPickerV3", () => {
  it("renders one option per parent + each other owner + None", () => {
    render(<OwnerPickerV3 owners={owners} value={NO_OWNER} onChange={() => {}} />);
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
    render(<OwnerPickerV3 owners={owners} value={NO_OWNER} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Sam" }));
    expect(onChange).toHaveBeenCalledWith({ slot: "parent2" });
  });

  it("clicking an other-owner emits the other OwnerRef with otherId", async () => {
    const onChange = vi.fn();
    render(<OwnerPickerV3 owners={owners} value={NO_OWNER} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Daycare" }));
    expect(onChange).toHaveBeenCalledWith({ slot: "other", otherId: "daycare" });
  });

  it("clicking None emits NO_OWNER to clear the ref (§F37)", async () => {
    const onChange = vi.fn();
    render(<OwnerPickerV3 owners={owners} value={{ slot: "parent1" }} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "None" }));
    expect(onChange).toHaveBeenCalledWith(NO_OWNER);
  });

  it("encodes slot key on data-owner so existing CSS selectors keep working", () => {
    render(<OwnerPickerV3 owners={owners} value={NO_OWNER} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Jake" })).toHaveAttribute("data-owner", "parent1");
    expect(screen.getByRole("button", { name: "Daycare" })).toHaveAttribute(
      "data-owner",
      "other:daycare",
    );
  });

  it("sets --owner-color inline on each option from the slot-keyed token", () => {
    render(<OwnerPickerV3 owners={owners} value={NO_OWNER} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Jake" }).getAttribute("style")).toContain(
      "--owner-color: var(--color-owner-parent-1)",
    );
    expect(screen.getByRole("button", { name: "Sam" }).getAttribute("style")).toContain(
      "--owner-color: var(--color-owner-parent-2)",
    );
    expect(screen.getByRole("button", { name: "Daycare" }).getAttribute("style")).toContain(
      "--owner-color: var(--color-owner-3)",
    );
    expect(screen.getByRole("button", { name: "Grandma" }).getAttribute("style")).toContain(
      "--owner-color: var(--color-owner-4)",
    );
    // "None" has no owner ref → property omitted so CSS fallback (border / accent) applies.
    expect(screen.getByRole("button", { name: "None" }).getAttribute("style") ?? "").not.toContain(
      "--owner-color",
    );
  });
});
