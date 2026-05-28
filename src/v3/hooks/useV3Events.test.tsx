import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Event } from "../schemas";
import { NO_OWNER } from "../schemas";
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
  owner: NO_OWNER,
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

  it("passes converter-defaulted events through unchanged", async () => {
    // Converter applies withV3EventDefaults before the callback fires; the hook
    // must not re-apply defaults. Simulate a fully-shaped converter output.
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useV3Events("child-1", "day-1"));
    // Simulate a converter-defaulted nap: kind="block", hasPutdown=false.
    const incoming = baseEvent({ type: "nap", kind: "block", hasPutdown: false });
    cb!([incoming]);
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    // Hook must preserve the converter's output exactly.
    expect(result.current.events[0]?.kind).toBe("block");
    expect(result.current.events[0]?.hasPutdown).toBe(false);
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

  it("saveEvent on a non-existing event creates it immediately and calls repository", async () => {
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
      await result.current.saveEvent(newEvent);
    });
    expect(createEventMock).toHaveBeenCalledWith({}, "child-1", newEvent);
    // Assert the exact inserted event — a partial copy (e.g. stripped lifecycle) would pass .toBeDefined().
    expect(result.current.events.find((e) => e.id === "e-new")).toEqual(newEvent);
  });

  it("saveEvent on an existing event updates it in place and calls repository", async () => {
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useV3Events("child-1", "day-1"));
    cb!([baseEvent({ id: "e-1", amountOz: 5 })]);
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    const updatedEvent = baseEvent({ id: "e-1", amountOz: 6 });
    await act(async () => {
      await result.current.saveEvent(updatedEvent);
    });
    expect(result.current.events[0]?.amountOz).toBe(6);
    expect(updateEventMock).toHaveBeenCalledWith({}, "child-1", "day-1", "e-1", updatedEvent);
    expect(createEventMock).not.toHaveBeenCalled();
  });

  it("saveEvent keeps events sorted by startTime numerically after a create", async () => {
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useV3Events("child-1", "day-1"));
    cb!([baseEvent({ id: "a", startTime: 9 * 60 }), baseEvent({ id: "c", startTime: 13 * 60 })]);
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    await act(async () => {
      await result.current.saveEvent(baseEvent({ id: "b", startTime: 11 * 60 }));
    });
    expect(result.current.events.map((e) => e.id)).toEqual(["a", "b", "c"]);
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

  describe("dayId-change re-subscription (audit P0-2 seam)", () => {
    // Must stop watching the old dayId and start watching the new one;
    // otherwise stale events from the previous day appear after a new-day cycle.
    it("transitions from empty dayId to a real one: subscribes once, with the new id", () => {
      const unsub = vi.fn();
      watchEventsMock.mockReturnValue(unsub);

      const { rerender } = renderHook(({ dayId }) => useV3Events("child-1", dayId), {
        initialProps: { dayId: "" },
      });
      // Empty → no subscription yet.
      expect(watchEventsMock).not.toHaveBeenCalled();

      rerender({ dayId: "day-new" });
      // Real id → exactly one subscription with the new id.
      expect(watchEventsMock).toHaveBeenCalledTimes(1);
      const [, childId, dayId] = watchEventsMock.mock.calls[0]!;
      expect(childId).toBe("child-1");
      expect(dayId).toBe("day-new");
    });

    it("transitions from one real dayId to another: unsubscribes from the old, subscribes to the new", () => {
      const unsubA = vi.fn();
      const unsubB = vi.fn();
      watchEventsMock.mockReturnValueOnce(unsubA).mockReturnValueOnce(unsubB);

      const { rerender } = renderHook(({ dayId }) => useV3Events("child-1", dayId), {
        initialProps: { dayId: "day-A" },
      });
      expect(watchEventsMock).toHaveBeenCalledTimes(1);
      expect(watchEventsMock.mock.calls[0]?.[2]).toBe("day-A");
      expect(unsubA).not.toHaveBeenCalled();

      rerender({ dayId: "day-B" });
      // Old subscription torn down, new one started with day-B.
      expect(unsubA).toHaveBeenCalledTimes(1);
      expect(watchEventsMock).toHaveBeenCalledTimes(2);
      expect(watchEventsMock.mock.calls[1]?.[2]).toBe("day-B");
    });

    it("transitions from real dayId back to empty: unsubscribes and does NOT re-subscribe", () => {
      const unsub = vi.fn();
      watchEventsMock.mockReturnValueOnce(unsub);

      const { rerender } = renderHook(({ dayId }) => useV3Events("child-1", dayId), {
        initialProps: { dayId: "day-old" },
      });
      expect(watchEventsMock).toHaveBeenCalledTimes(1);

      rerender({ dayId: "" });
      // Old subscription torn down; no new subscription.
      expect(unsub).toHaveBeenCalledTimes(1);
      expect(watchEventsMock).toHaveBeenCalledTimes(1);
    });
  });
});
