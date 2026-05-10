/**
 * V3 Event defensive defaults — bridge V2-shape Firestore docs (string
 * startTime, source/status/recorded triplet, no lifecycle, no kind, no
 * hasPutdown) into V3 shape on read so the engine doesn't crash on
 * `undefined.state` and the renderer doesn't display NaN:NaN.
 *
 * Transitional safety net — once V2 reads stop and Firestore only
 * holds V3-shape docs, this either retires or stays as cheap insurance.
 */

import { describe, expect, it } from "vitest";
import type { Event, OwnersConfig } from "../schemas";
import { withV3EventDefaults } from "./eventDefaults";

const ownersConfig: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#111" },
  parent2: { displayName: "Sam", color: "#222" },
  other: [{ id: "daycare", displayName: "Daycare", color: "#333" }],
};

describe("withV3EventDefaults", () => {
  it("passes through a fully-shaped V3 event unchanged", () => {
    const v3: Event = {
      id: "e-1",
      dayId: "d-1",
      eventKey: "bottle_1",
      type: "bottle",
      kind: "instant",
      startTime: 7 * 60 + 30,
      label: "Bottle 1",
      hasPutdown: false,
      lifecycle: { state: "completed", committedAt: 7 * 60 + 30 },
    };
    expect(withV3EventDefaults(v3)).toEqual(v3);
  });

  it("converts a V2 'HH:MM' startTime string to TimeMin", () => {
    const v2 = {
      id: "e-1",
      dayId: "d-1",
      eventKey: "bottle_1",
      type: "bottle",
      label: "Bottle 1",
      startTime: "07:30",
      source: "actual",
      status: "actual",
      recorded: true,
    } as unknown as Event;
    const out = withV3EventDefaults(v2);
    expect(out.startTime).toBe(7 * 60 + 30);
  });

  it("converts a V2 endTime string to TimeMin", () => {
    const v2 = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:00",
      endTime: "10:30",
      source: "actual",
      status: "actual",
      recorded: true,
    } as unknown as Event;
    const out = withV3EventDefaults(v2);
    expect(out.startTime).toBe(9 * 60);
    expect(out.endTime).toBe(10 * 60 + 30);
  });

  it("derives lifecycle from V2 source/status/recorded", () => {
    const recorded = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:00",
      endTime: "10:30",
      source: "actual",
      status: "completed",
      recorded: true,
    } as unknown as Event;
    expect(withV3EventDefaults(recorded).lifecycle).toEqual({
      state: "completed",
      committedAt: 9 * 60,
    });

    const projected = {
      id: "n-2",
      dayId: "d-1",
      eventKey: "nap_2",
      type: "nap",
      label: "Nap 2",
      startTime: "13:00",
      endTime: "14:30",
      source: "projected",
      status: "projected",
      recorded: false,
    } as unknown as Event;
    expect(withV3EventDefaults(projected).lifecycle).toEqual({ state: "projected" });

    const overridden = {
      id: "n-3",
      dayId: "d-1",
      eventKey: "nap_3",
      type: "nap",
      label: "Nap 3",
      startTime: "16:00",
      source: "manual",
      status: "overridden",
      recorded: false,
    } as unknown as Event;
    expect(withV3EventDefaults(overridden).lifecycle).toEqual({
      state: "overridden",
      annotatedAt: 16 * 60,
    });
  });

  it("started block: recorded=true with no endTime → lifecycle.started", () => {
    const v2 = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:00",
      source: "actual",
      status: "active",
      recorded: true,
    } as unknown as Event;
    expect(withV3EventDefaults(v2).lifecycle).toEqual({ state: "started", committedAt: 9 * 60 });
  });

  it("missing kind is derived from type+endTime", () => {
    const napDoc = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:00",
      endTime: "10:30",
    } as unknown as Event;
    const bottleDoc = {
      id: "b-1",
      dayId: "d-1",
      eventKey: "bottle_1",
      type: "bottle",
      label: "Bottle 1",
      startTime: "07:30",
    } as unknown as Event;
    expect(withV3EventDefaults(napDoc).kind).toBe("block");
    expect(withV3EventDefaults(bottleDoc).kind).toBe("instant");
  });

  it("missing hasPutdown defaults to false", () => {
    const v2 = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:00",
      endTime: "10:30",
    } as unknown as Event;
    expect(withV3EventDefaults(v2).hasPutdown).toBe(false);
  });

  it("converts V2 owner string to slot OwnerRef heuristically", () => {
    // V2 owner was a free string display name. V3 needs a slot ref.
    // We can't recover the slot identity from a string post-hoc; map
    // anything truthy onto parent1 so the engine has *something*. The
    // user can re-edit to fix it in the drawer.
    const v2 = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:00",
      endTime: "10:30",
      owner: "Jake",
    } as unknown as Event;
    const out = withV3EventDefaults(v2);
    expect(out.owner).toEqual({ slot: "parent1" });
  });

  it("leaves a V3 OwnerRef untouched", () => {
    const v3: Event = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      endTime: 10 * 60 + 30,
      owner: { slot: "parent2" },
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
    expect(withV3EventDefaults(v3).owner).toEqual({ slot: "parent2" });
  });

  it("resolves V2 owner string to parent1 slot when displayName matches", () => {
    const v2 = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:00",
      endTime: "10:30",
      owner: "Jake",
    } as unknown as Event;
    expect(withV3EventDefaults(v2, ownersConfig).owner).toEqual({ slot: "parent1" });
  });

  it("resolves V2 owner string to parent2 slot when displayName matches", () => {
    const v2 = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:00",
      endTime: "10:30",
      owner: "Sam",
    } as unknown as Event;
    expect(withV3EventDefaults(v2, ownersConfig).owner).toEqual({ slot: "parent2" });
  });

  it("resolves V2 owner string to other slot+id when displayName matches", () => {
    const v2 = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:00",
      endTime: "10:30",
      owner: "Daycare",
    } as unknown as Event;
    expect(withV3EventDefaults(v2, ownersConfig).owner).toEqual({
      slot: "other",
      otherId: "daycare",
    });
  });

  it("falls back to parent1 when V2 owner string does not match any owner displayName", () => {
    const v2 = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:00",
      endTime: "10:30",
      owner: "Unknown",
    } as unknown as Event;
    expect(withV3EventDefaults(v2, ownersConfig).owner).toEqual({ slot: "parent1" });
  });

  it("falls back to parent1 when no owners config is supplied", () => {
    const v2 = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:00",
      endTime: "10:30",
      owner: "Jake",
    } as unknown as Event;
    expect(withV3EventDefaults(v2).owner).toEqual({ slot: "parent1" });
  });

  it("strips owner when the V2 string is empty / falsy", () => {
    const v2 = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:00",
      endTime: "10:30",
      owner: "",
    } as unknown as Event;
    expect("owner" in withV3EventDefaults(v2)).toBe(false);
  });
});
