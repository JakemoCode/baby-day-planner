import { describe, expect, it } from "vitest";
import type { Event } from "../schemas";
import { isPersistedActual } from "./isPersistedActual";

const ev = (id: string): Event => ({
  id,
  dayId: "d1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  startTime: 9 * 60,
  label: "Nap 1",
  hasPutdown: false,
  lifecycle: { state: "projected" },
});

describe("isPersistedActual", () => {
  it("returns true when the id is in the list", () => {
    expect(isPersistedActual("manual-1", [ev("manual-1"), ev("manual-2")])).toBe(true);
  });

  it("returns false when the id is not in the list", () => {
    expect(isPersistedActual("proj-1", [ev("manual-1"), ev("manual-2")])).toBe(false);
  });

  it("returns false on an empty list", () => {
    expect(isPersistedActual("anything", [])).toBe(false);
  });
});
