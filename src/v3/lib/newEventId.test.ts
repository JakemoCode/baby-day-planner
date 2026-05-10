/**
 * Collision-safe event id generator. Replaces all `${prefix}-${Date.now()}`
 * patterns in V3 code; covered by a pre-merge grep audit in PR-C1.
 */

import { describe, expect, it } from "vitest";
import { newEventId } from "./newEventId";

describe("newEventId", () => {
  it("returns a string starting with the prefix and underscore", () => {
    const id = newEventId("bottle");
    expect(id).toMatch(/^bottle_/);
  });

  it("returns a unique value across two consecutive calls (collision-safe)", () => {
    const a = newEventId("manual");
    const b = newEventId("manual");
    expect(a).not.toBe(b);
  });

  it("uses crypto.randomUUID-shape suffix (8-4-4-4-12 hex)", () => {
    const id = newEventId("nap");
    expect(id).toMatch(/^nap_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("works with an empty prefix (still emits a uniquely identifiable id)", () => {
    const id = newEventId("");
    expect(id).toMatch(/^_[0-9a-f]{8}-/);
  });
});
