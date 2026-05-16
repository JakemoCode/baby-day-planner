import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Event, OwnersConfig } from "../schemas";
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

  it("passes converter-defaulted events through unchanged", async () => {
    // The converter (v3EventConverter.fromFirestore) applies withV3EventDefaults
    // before the watcher callback fires; the hook is a pure subscriber and
    // must not re-apply defaults. Simulate what the converter produces:
    // a fully-shaped event with kind and hasPutdown already set.
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const owners: OwnersConfig = {
      parent1: { displayName: "Jake", color: "#111" },
      parent2: { displayName: "Sam", color: "#222" },
      other: [{ id: "daycare", displayName: "Daycare", color: "#333" }],
    };
    const { result } = renderHook(() => useV3Events("child-1", "day-1", owners));
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
    // Optimistic state must contain the exact event we inserted, not
    // just "something with that id." A bug that wrote a partial copy
    // (e.g. stripping lifecycle on insert) would have passed the
    // previous .toBeDefined() check.
    expect(result.current.events.find((e) => e.id === "e-new")).toEqual(newEvent);
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

  describe("dayId-change re-subscription (audit P0-2 seam)", () => {
    // The dashboard chain: useV3Day delivers a new day → page rerenders
    // with the new day.id → useV3Events is called with the new dayId
    // and must (a) stop watching the previous dayId, (b) start watching
    // the new one. Without this, events from the OLD day still appear
    // on the dashboard after a "Start New Day" cycle.
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
