import { describe, it, expect } from "vitest";
import type { Event } from "@/domain";
import { makeEvent } from "@/domain";
import { groupInstants } from "./groupInstants";

const inst = (id: string, type: Event["type"], at: string): Event =>
  makeEvent({
    id,
    dayId: "d",
    eventKey: id,
    type,
    label: id,
    startTime: at,
    source: "manual",
    status: "completed",
  });

const block = (id: string, start: string, end: string): Event =>
  makeEvent({
    id,
    dayId: "d",
    eventKey: id,
    type: "wake_window",
    label: id,
    startTime: start,
    endTime: end,
    source: "projected",
    status: "projected",
  });

describe("groupInstants", () => {
  it("returns an empty array when no events are provided", () => {
    expect(groupInstants([])).toEqual([]);
  });

  it("returns one group with one item for a lone instant", () => {
    const groups = groupInstants([inst("b1", "bottle", "07:00")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(1);
    expect(groups[0]?.startMinutes).toBe(7 * 60);
  });

  it("groups two instants at the same time into one cluster (these will fan horizontally)", () => {
    const groups = groupInstants([inst("b1", "bottle", "07:00"), inst("p1", "pump", "07:00")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(2);
  });

  it("returns separate groups for distinct times, sorted ascending", () => {
    const groups = groupInstants([inst("late", "pump", "13:00"), inst("early", "bottle", "07:00")]);
    expect(groups.map((g) => g.startMinutes)).toEqual([7 * 60, 13 * 60]);
  });

  it("ignores block-kind events; only instants appear in any group", () => {
    const groups = groupInstants([block("ww1", "07:00", "09:00"), inst("b1", "bottle", "07:30")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.every((e) => e.kind === "instant")).toBe(true);
  });
});
