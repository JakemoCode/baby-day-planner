/**
 * V3 OwnershipTemplate → V2 OwnershipTemplate back-compat shim tests.
 *
 * Covers the Phase B transitional path where V3 template docs land in
 * Firestore but are read by V2 useTemplates. Mirrors the V2/V3 shape
 * delta: displayName→label, OwnerRef[] → free-string Owner[].
 */

import { describe, expect, it } from "vitest";
import type { OwnershipTemplate as V2Template } from "@/domain";
import type { OwnersConfig } from "../schemas";
import { withV2TemplateBackcompat } from "./v2Backcompat";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Kelly", color: "#f0a" },
  other: [{ id: "daycare-1", displayName: "Daycare", color: "#0f0" }],
};

describe("withV2TemplateBackcompat", () => {
  it("remaps V3 displayName to V2 label", () => {
    const v3 = {
      id: "tpl-1",
      displayName: "Saturday",
      napOwners: [],
      wakeWindowOwners: [],
    };
    const out = withV2TemplateBackcompat(v3, owners);
    expect(out.id).toBe("tpl-1");
    expect(out.label).toBe("Saturday");
  });

  it("converts V3 OwnerRef napOwners to V2 string napOwners with config", () => {
    const v3 = {
      id: "tpl-1",
      displayName: "Saturday",
      napOwners: [
        { slot: "parent1" } as const,
        { slot: "parent2" } as const,
        { slot: "other", otherId: "daycare-1" } as const,
      ],
      wakeWindowOwners: [{ slot: "parent1" } as const],
      bottleOwners: [{ slot: "parent2" } as const],
      bedtimeOwner: { slot: "parent1" } as const,
    };
    const out = withV2TemplateBackcompat(v3, owners);
    expect(out.napOwners).toEqual(["Jake", "Kelly", "Daycare"]);
    expect(out.wakeWindowOwners).toEqual(["Jake"]);
    expect(out.bottleOwners).toEqual(["Kelly"]);
    expect(out.bedtimeOwner).toBe("Jake");
  });

  it("drops owners (cosmetic loss) when no OwnersConfig is supplied", () => {
    const v3 = {
      id: "tpl-1",
      displayName: "Saturday",
      napOwners: [{ slot: "parent1" } as const, { slot: "parent2" } as const],
      wakeWindowOwners: [{ slot: "parent1" } as const],
      bedtimeOwner: { slot: "parent2" } as const,
    };
    const out = withV2TemplateBackcompat(v3);
    expect(out.napOwners).toEqual([]);
    expect(out.wakeWindowOwners).toEqual([]);
    expect(out.bedtimeOwner).toBeUndefined();
  });

  it("passes through an already-V2 template unchanged", () => {
    const v2: V2Template = {
      id: "tpl-1",
      label: "Saturday",
      napOwners: ["Jake", "Kelly"],
      wakeWindowOwners: ["Jake"],
      bottleOwners: ["Kelly"],
      bedtimeOwner: "Jake",
    };
    const out = withV2TemplateBackcompat(v2, owners);
    expect(out).toEqual(v2);
  });
});
