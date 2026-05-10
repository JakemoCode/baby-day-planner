import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { OwnersConfig } from "@/v3/schemas";
import { OwnerPill } from "./OwnerPill";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Kelly", color: "#f0a" },
  other: [{ id: "daycare", displayName: "Daycare", color: "#aa0" }],
};

describe("OwnerPill", () => {
  it("renders the owner display name with --owner-color when set", () => {
    render(<OwnerPill owner={{ slot: "parent1" }} owners={owners} />);
    const pill = screen.getByText("Jake");
    expect(pill).toBeVisible();
    expect(pill.style.getPropertyValue("--owner-color")).toBe("#0af");
  });

  it("resolves 'other' owner via owners.other[id]", () => {
    render(
      <OwnerPill owner={{ slot: "other", otherId: "daycare" }} owners={owners} />,
    );
    expect(screen.getByText("Daycare")).toBeVisible();
  });

  it("renders nothing when owner is undefined", () => {
    const { container } = render(<OwnerPill owner={undefined} owners={owners} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when owner ref is stale (other not found)", () => {
    const { container } = render(
      <OwnerPill owner={{ slot: "other", otherId: "missing" }} owners={owners} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("composes optional className with the base pill class", () => {
    render(
      <OwnerPill
        owner={{ slot: "parent2" }}
        owners={owners}
        className="custom-variant"
      />,
    );
    expect(screen.getByText("Kelly").className).toMatch(/custom-variant/);
  });
});
