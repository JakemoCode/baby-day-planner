/** Owner lookup at the UI boundary; slot identity stays stable across display renames. */

import { describe, expect, it } from "vitest";
import type { OwnerRef, OwnersConfig } from "../schemas";
import { ownerColor, ownerDisplayName } from "./owners";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [
    { id: "daycare", displayName: "Daycare", color: "#ccc" },
    { id: "grandma", displayName: "Grandma", color: "#fa0" },
  ],
};

describe("ownerDisplayName", () => {
  it("resolves parent1 slot to its configured display name", () => {
    expect(ownerDisplayName({ slot: "parent1" }, owners)).toBe("Jake");
  });
  it("resolves parent2 slot to its configured display name", () => {
    expect(ownerDisplayName({ slot: "parent2" }, owners)).toBe("Sam");
  });
  it("resolves an other-slot ref by otherId", () => {
    expect(ownerDisplayName({ slot: "other", otherId: "daycare" }, owners)).toBe("Daycare");
    expect(ownerDisplayName({ slot: "other", otherId: "grandma" }, owners)).toBe("Grandma");
  });
  it("returns empty string for an unknown otherId rather than throwing", () => {
    // A stale event ref to a deleted other-owner shouldn't crash the UI;
    // the renderer can fall back to its 'unassigned' affordance.
    expect(ownerDisplayName({ slot: "other", otherId: "ghost" }, owners)).toBe("");
  });
  it("returns empty string when the ref itself is undefined", () => {
    expect(ownerDisplayName(undefined, owners)).toBe("");
  });
});

describe("ownerColor (slot-keyed token references)", () => {
  it("resolves parent slots to their CSS variable references", () => {
    expect(ownerColor({ slot: "parent1" }, owners)).toBe("var(--color-owner-parent-1)");
    expect(ownerColor({ slot: "parent2" }, owners)).toBe("var(--color-owner-parent-2)");
  });
  it("resolves other-slot refs by index into owners.other[]", () => {
    // owners.other[0] = "daycare", index 0 → token 3
    expect(ownerColor({ slot: "other", otherId: "daycare" }, owners)).toBe("var(--color-owner-3)");
    // owners.other[1] = "grandma", index 1 → token 4
    expect(ownerColor({ slot: "other", otherId: "grandma" }, owners)).toBe("var(--color-owner-4)");
  });
  it("cycles back to token 3 once owners.other has more than 4 entries", () => {
    const many: OwnersConfig = {
      ...owners,
      other: [
        { id: "o1", displayName: "O1" },
        { id: "o2", displayName: "O2" },
        { id: "o3", displayName: "O3" },
        { id: "o4", displayName: "O4" },
        { id: "o5", displayName: "O5" }, // index 4 → 4 % 4 = 0 → token 3
      ],
    };
    expect(ownerColor({ slot: "other", otherId: "o5" }, many)).toBe("var(--color-owner-3)");
  });
  it("returns null for an unknown other-id", () => {
    expect(ownerColor({ slot: "other", otherId: "ghost" }, owners)).toBeNull();
  });
  it("returns null when the ref itself is undefined", () => {
    expect(ownerColor(undefined, owners)).toBeNull();
  });
  it("returns null for slot 'none'", () => {
    expect(ownerColor({ slot: "none" }, owners)).toBeNull();
  });
});

describe("ownerDisplayName — type coverage", () => {
  it("accepts a narrowed OwnerRef without compile error", () => {
    const ref: OwnerRef = { slot: "parent1" };
    expect(ownerDisplayName(ref, owners)).toBe("Jake");
  });
});
