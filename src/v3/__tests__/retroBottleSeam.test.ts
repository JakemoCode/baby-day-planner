/**
 * Seam test for R5.14: a bottle typed in after the fact goes through the REAL
 * useDrawer create path (the realize tag) into the REAL projectDay and
 * renderProjection. The drawer's neighbour list must never keep a forecast slot
 * beside the logged feed, which is what refused 13:20 and doubled 14:05.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { projectDay } from "../engine/projectDay";
import { ALL_RULES } from "../engine/rules";
import { forecastIntervalMinutes } from "../engine/bottleIntervalRules";
import { renderProjection } from "../ui/renderProjection";
import { useDrawer } from "../hooks/useDrawer";
import { isEngineEmittedId } from "../lib/eventConventions";
import { aContext, aDay, aSettings } from "./factories";
import type { Event } from "../schemas";
import { NO_OWNER } from "../schemas";

const NOW = 15 * 60 + 30;

function ctxWith(actuals: Event[]) {
  return aContext({
    day: aDay({ wakeTime: 7 * 60 }),
    settings: aSettings({
      bottleChain: { bufferAfterWakeMinutes: 10 },
      defaultBottleIntervalMinutes: 180,
    }),
    nowMinutes: NOW,
    actuals,
  });
}

function project(actuals: Event[]): Event[] {
  const ctx = ctxWith(actuals);
  return projectDay(
    { day: ctx.day, settings: ctx.settings, actuals: ctx.actuals, nowMinutes: ctx.nowMinutes },
    { rules: [...ALL_RULES] },
  );
}

function fabTemplate(): Event {
  return {
    id: "bottle_fab",
    dayId: "day_test",
    eventKey: "bottle_4",
    type: "bottle",
    kind: "instant",
    label: "Bottle 4",
    startTime: NOW,
    amountOz: 4,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "projected" },
  };
}

async function logBottleAt(startTime: number): Promise<Event[]> {
  const settings = ctxWith([]).settings;
  const saveNewEvent = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useDrawer({
      saveEvent: vi.fn(),
      deleteOptimistic: vi.fn(),
      saveNewEvent,
      forecast: { projection: project([]), intervalMinutes: forecastIntervalMinutes(settings) },
    }),
  );
  const template = fabTemplate();
  act(() => result.current.openCreate(template));
  await act(async () => {
    await result.current.onSave({
      ...template,
      startTime,
      lifecycle: { state: "completed", committedAt: NOW },
    });
  });
  const saved = saveNewEvent.mock.calls[0]![0] as Event;
  return renderProjection(project([saved]), settings, NOW).filter((e) => e.type === "bottle");
}

describe("seam: a bottle logged after the fact replaces its forecast slot (R5.14)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 15, 30));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["13:05", 13 * 60 + 5],
    ["13:20", 13 * 60 + 20],
    ["14:05", 14 * 60 + 5],
    ["14:45", 14 * 60 + 45],
    ["15:25", 15 * 60 + 25],
  ])("logged at %s: no forecast slot within 10 min of it", async (_label, startTime) => {
    const bottles = await logBottleAt(startTime);
    const nearbySlots = bottles.filter(
      (b) => isEngineEmittedId(b.id) && Math.abs(b.startTime - startTime) < 10,
    );
    expect(nearbySlots).toEqual([]);
  });

  it("logged at 14:05: the bottles before now are 7:10, 10:10 and 14:05", async () => {
    const bottles = await logBottleAt(14 * 60 + 5);
    const past = bottles.filter((b) => b.startTime <= NOW).map((b) => b.startTime);
    expect(past).toEqual([7 * 60 + 10, 10 * 60 + 10, 14 * 60 + 5]);
  });

  it("logged at 13:05, just before the 13:15 slot: that slot yields and 10:10 stays", async () => {
    const bottles = await logBottleAt(13 * 60 + 5);
    const past = bottles.filter((b) => b.startTime <= NOW).map((b) => b.startTime);
    expect(past).toEqual([7 * 60 + 10, 10 * 60 + 10, 13 * 60 + 5]);
  });

  it("logged at 13:20: the 13:15 slot yields", async () => {
    const bottles = await logBottleAt(13 * 60 + 20);
    const past = bottles.filter((b) => b.startTime <= NOW).map((b) => b.startTime);
    expect(past).toEqual([7 * 60 + 10, 10 * 60 + 10, 13 * 60 + 20]);
  });
});
