import { describe, it, expect } from "vitest";
import type { EventType } from "../../schemas";
import { DRAWER_FIELD_SCHEMA, type DrawerField, type DrawerFieldRow } from "./drawerFieldSchema";

function flatten(rows: DrawerFieldRow[]): DrawerField[] {
  return rows.flatMap((r) => (typeof r === "string" ? [r] : r.row));
}

describe("DRAWER_FIELD_SCHEMA", () => {
  it("maps each event type to the fields the drawer renders, in order", () => {
    const expected: Record<EventType, DrawerField[]> = {
      wake_window: ["owner"],
      nap: ["startTime", "endTime", "owner"],
      bottle: ["startTime", "amount", "owner"],
      pump: ["startTime", "endTime", "volumes"],
      bedtime: ["startTime", "owner"],
      extra: ["label", "startTime", "endTime", "owner"],
      daily_recurring: ["startTime", "owner"],
      daycare_dropoff: ["startTime", "owner"],
      daycare_pickup: ["startTime", "owner"],
    };
    for (const type of Object.keys(expected) as EventType[]) {
      expect(flatten(DRAWER_FIELD_SCHEMA[type])).toEqual(expected[type]);
    }
  });

  it("pairs pump start/end onto one row and stacks every other type's times", () => {
    expect(DRAWER_FIELD_SCHEMA.pump[0]).toEqual({ row: ["startTime", "endTime"] });
    expect(DRAWER_FIELD_SCHEMA.nap.every((r) => typeof r === "string")).toBe(true);
  });
});
