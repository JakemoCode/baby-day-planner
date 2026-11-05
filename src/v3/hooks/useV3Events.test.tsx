import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Event } from "../schemas";
import { NO_OWNER } from "../schemas";
import { useV3Events } from "./useV3Events";
import { useDrawer } from "./useDrawer";

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

describe("R5.14: a drawer edit that drops the realize tag clears it from the stored doc", () => {
  beforeEach(() => {
    watchEventsMock.mockReset();
    updateEventMock.mockClear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 15, 30));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // A bottle logged at 14:05 realized the 13:15 slot. Corrected to 09:00, the 10:10
  // slot is nearer and after it, so the tag must go: updateDoc merges, so an absent
  // key would leave `true` stored and the 07:10 forecast would stay absorbed.
  it("writes realizedForecast: false through updateEvent and the optimistic state", async () => {
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const logged = baseEvent({
      id: "bottle_fab",
      startTime: 14 * 60 + 5,
      realizedForecast: true,
    });
    const slot = (id: string, startTime: number): Event =>
      baseEvent({ id, startTime, lifecycle: { state: "recorded", annotatedAt: startTime } });
    const withoutLogged = [
      slot("proj_bottle_t430", 7 * 60 + 10),
      slot("proj_bottle_t610", 10 * 60 + 10),
      slot("proj_bottle_t795", 13 * 60 + 15),
    ];
    const { result } = renderHook(() => {
      const events = useV3Events("child-1", "day-1");
      const drawer = useDrawer({
        saveEvent: events.saveEvent,
        deleteOptimistic: events.deleteOptimistic,
        forecast: {
          projection: [withoutLogged[0]!, withoutLogged[1]!, logged],
          intervalMinutes: 180,
          projectWithout: () => withoutLogged,
        },
      });
      return { events, drawer };
    });
    act(() => cb!([logged]));
    await waitFor(() => expect(result.current.events.events).toHaveLength(1));

    act(() => result.current.drawer.openEdit(logged));
    await act(async () => {
      await result.current.drawer.onSave({ ...logged, startTime: 9 * 60 });
    });

    const patch = updateEventMock.mock.calls[0]![4] as Partial<Event>;
    expect(patch.realizedForecast).toBe(false);
    expect(result.current.events.events[0]!.realizedForecast).toBe(false);
  });
});
