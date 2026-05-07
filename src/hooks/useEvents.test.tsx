import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Event } from "@/domain";
import { useEvents } from "./useEvents";

const watchEventsMock = vi.fn();
const createEventMock = vi.fn().mockResolvedValue(undefined);
const updateEventMock = vi.fn().mockResolvedValue(undefined);
const deleteEventMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/repositories/events", () => ({
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
  label: "Bottle 1",
  startTime: "07:05",
  amountOz: 5,
  source: "actual",
  status: "actual",
  ...overrides,
});

describe("useEvents", () => {
  it("exposes watched events", async () => {
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useEvents("child-1", "day-1"));
    cb!([baseEvent({})]);
    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
    });
  });

  it("applies createOptimistic immediately, then calls repository", async () => {
    let cb: ((events: Event[]) => void) | undefined;
    watchEventsMock.mockImplementation((_db, _cid, _did, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useEvents("child-1", "day-1"));
    cb!([]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newEvent = baseEvent({ id: "e-new" });
    await act(async () => {
      await result.current.createOptimistic(newEvent);
    });
    expect(createEventMock).toHaveBeenCalledWith({}, "child-1", newEvent);
    expect(result.current.events.find((e) => e.id === "e-new")).toBeDefined();
  });
});
