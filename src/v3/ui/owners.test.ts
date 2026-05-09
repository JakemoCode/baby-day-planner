/**
 * Owner display-name lookup at the UI boundary.
 *
 * The engine stores OwnerRef as a slot identity; the UI looks up the
 * configured displayName at render time. This keeps slot identity
 * stable across rename ("Mom" → "Mama") without rewriting any events.
 */

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

describe("ownerColor", () => {
  it("resolves parent slots to their configured color", () => {
    expect(ownerColor({ slot: "parent1" }, owners)).toBe("#0af");
    expect(ownerColor({ slot: "parent2" }, owners)).toBe("#f0a");
  });
  it("resolves other-slot refs by otherId", () => {
    expect(ownerColor({ slot: "other", otherId: "daycare" }, owners)).toBe("#ccc");
  });
  it("returns null for an unknown other-id", () => {
    expect(ownerColor({ slot: "other", otherId: "ghost" }, owners)).toBeNull();
  });
  it("returns null when the ref itself is undefined", () => {
    expect(ownerColor(undefined, owners)).toBeNull();
  });
});

describe("ownerDisplayName — type coverage", () => {
  it("accepts a narrowed OwnerRef without compile error", () => {
    const ref: OwnerRef = { slot: "parent1" };
    expect(ownerDisplayName(ref, owners)).toBe("Jake");
  });
});
