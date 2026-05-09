import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Event } from "../schemas";
import { useV3Events } from "./useV3Events";

const watchEventsMock = vi.fn();
const createEventMock = vi.fn().mockResolvedValue(undefined);
const updateEventMock = vi.fn().mockResolvedValue(undefined);
const deleteEventMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../repositories/events", () => ({
  watchEvents: (...args: unknown[]) => watchEventsMock(...args),
  createEvent: (...args: unknown[]) => createEventMock(...args),
  updateEvent: (...args: unknown[]) => updateEventMock(...args),
  deleteEvent: (...args: unknown[]) => deleteEventMock(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ db: {} }));

const baseEvent = (overrides: Partial<Event>): Event => ({
  id: "e-1",
  dayId: "day-1",
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  startTime: 7 * 60 + 5,
  label: "Bottle 1",
  amountOz: 5,
  hasPutdown: false,
  lifecycle: { state: "completed", committedAt: 7 * 60 + 5 },
  ...overrides,
});

describe("useV3Events", () => {
  beforeEach(() => {
    watchEventsMock.mockReset();
    createEventMock.mockClear();
    updateEventMock.mockClear();
    deleteEventMock.mockClear();
  });

  it("exposes V3 events from the repo watcher", async () => {
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useV3Events("child-1", "day-1"));
    cb!([baseEvent({})]);
    await waitFor(() => expect(result.current.events).toHaveLength(1));
  });

  it("applies createOptimistic immediately, then calls repository", async () => {
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useV3Events("child-1", "day-1"));
    cb!([]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newEvent = baseEvent({ id: "e-new", startTime: 9 * 60 });
    await act(async () => {
      await result.current.createOptimistic(newEvent);
    });
    expect(createEventMock).toHaveBeenCalledWith({}, "child-1", newEvent);
    expect(result.current.events.find((e) => e.id === "e-new")).toBeDefined();
  });

  it("createOptimistic keeps events sorted by TimeMin numerically", async () => {
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useV3Events("child-1", "day-1"));
    cb!([baseEvent({ id: "a", startTime: 9 * 60 }), baseEvent({ id: "c", startTime: 13 * 60 })]);
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    await act(async () => {
      await result.current.createOptimistic(baseEvent({ id: "b", startTime: 11 * 60 }));
    });
    expect(result.current.events.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("updateOptimistic patches in place", async () => {
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useV3Events("child-1", "day-1"));
    cb!([baseEvent({ id: "e-1", amountOz: 5 })]);
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    await act(async () => {
      await result.current.updateOptimistic("e-1", { amountOz: 6 });
    });
    expect(result.current.events[0]?.amountOz).toBe(6);
    expect(updateEventMock).toHaveBeenCalledWith({}, "child-1", "day-1", "e-1", { amountOz: 6 });
  });

  it("deleteOptimistic drops the event from local state", async () => {
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useV3Events("child-1", "day-1"));
    cb!([baseEvent({ id: "e-1" }), baseEvent({ id: "e-2", startTime: 9 * 60 })]);
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    await act(async () => {
      await result.current.deleteOptimistic("e-1");
    });
    expect(result.current.events.map((e) => e.id)).toEqual(["e-2"]);
    expect(deleteEventMock).toHaveBeenCalledWith({}, "child-1", "day-1", "e-1");
  });

  it("skips subscription when dayId is empty", () => {
    renderHook(() => useV3Events("child-1", ""));
    expect(watchEventsMock).not.toHaveBeenCalled();
  });
});
