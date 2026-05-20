/**
 * useDrawer — concentrated projected-event re-save protocol.
 *
 * All eight behaviors in priority order per §A spec:
 *
 *   1. openCreate(template) opens drawer in create mode with the template
 *   2. openEdit(event) opens drawer in edit mode with the event
 *   3. close() closes the drawer
 *   4. onSave(event) for create mode persists the event as-is
 *   5. onSave(event) for edit mode where event IS in actuals persists with same id
 *   6. onSave(event) for edit mode where event is NOT in actuals re-IDs to
 *      `recorded_${event.eventKey}` and persists
 *   7. onDelete(event) where event is in actuals calls deleteOptimistic(event.id)
 *   8. onDelete(event) where event is projected (not in actuals) just closes
 */

import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Event } from "../schemas";
import { NO_OWNER } from "../schemas";
import { useDrawer } from "./useDrawer";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt-proj-1",
    dayId: "day-1",
    eventKey: "nap_1",
    type: "nap",
    kind: "block",
    label: "Nap 1",
    startTime: 9 * 60,
    endTime: 10 * 60,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "projected" },
    ...overrides,
  };
}

function makeActualEvent(overrides: Partial<Event> = {}): Event {
  return makeEvent({
    id: "evt-actual-1",
    lifecycle: { state: "completed", committedAt: 9 * 60 },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Helper: render the hook with common defaults
// ---------------------------------------------------------------------------

function makeSaveEvent() {
  const fn = vi.fn();
  fn.mockResolvedValue(undefined);
  return fn as unknown as ((event: Event) => Promise<void>) & ReturnType<typeof vi.fn>;
}

function makeDeleteFn() {
  const fn = vi.fn();
  fn.mockResolvedValue(undefined);
  return fn as unknown as ((eventId: string) => Promise<void>) & ReturnType<typeof vi.fn>;
}

function setup({
  actuals = [] as Event[],
  saveEvent = makeSaveEvent(),
  deleteOptimistic = makeDeleteFn(),
}: {
  actuals?: Event[];
  saveEvent?: ((event: Event) => Promise<void>) & ReturnType<typeof vi.fn>;
  deleteOptimistic?: ((eventId: string) => Promise<void>) & ReturnType<typeof vi.fn>;
} = {}) {
  const result = renderHook(() => useDrawer(actuals, saveEvent, deleteOptimistic));
  return { ...result, saveEvent, deleteOptimistic };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useDrawer", () => {
  // 1. openCreate(template)
  it("openCreate(template) opens drawer in create mode with the template", () => {
    const { result } = setup();
    const template = makeEvent({ id: "tpl-1" });

    act(() => result.current.openCreate(template));

    expect(result.current.drawer).toEqual({ open: true, mode: "create", template });
  });

  // 2. openEdit(event)
  it("openEdit(event) opens drawer in edit mode with the event", () => {
    const { result } = setup();
    const event = makeEvent();

    act(() => result.current.openEdit(event));

    expect(result.current.drawer).toEqual({ open: true, mode: "edit", event });
  });

  // 3. close()
  it("close() closes the drawer", () => {
    const { result } = setup();
    const event = makeEvent();

    act(() => result.current.openEdit(event));
    expect(result.current.drawer.open).toBe(true);

    act(() => result.current.close());
    expect(result.current.drawer).toEqual({ open: false });
  });

  // 4. onSave in create mode persists event as-is
  it("onSave in create mode calls saveEvent with the event unchanged and closes", async () => {
    const saveEvent = makeSaveEvent();
    const { result } = setup({ saveEvent });
    const template = makeEvent({ id: "tpl-1", eventKey: "nap_1" });

    act(() => result.current.openCreate(template));

    await act(async () => {
      await result.current.onSave(template);
    });

    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(saveEvent).toHaveBeenCalledWith(template);
    expect(result.current.drawer).toEqual({ open: false });
  });

  // 5. onSave in edit mode where event IS in actuals — same id
  it("onSave for edit of persisted actual preserves the event id", async () => {
    const actual = makeActualEvent({ id: "evt-actual-1", eventKey: "nap_1" });
    const saveEvent = makeSaveEvent();
    const { result } = setup({ actuals: [actual], saveEvent });

    act(() => result.current.openEdit(actual));

    const updated = { ...actual, startTime: 10 * 60 };
    await act(async () => {
      await result.current.onSave(updated);
    });

    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "evt-actual-1" }));
    expect(result.current.drawer).toEqual({ open: false });
  });

  // 6. onSave in edit mode where event is NOT in actuals — re-ID to recorded_${eventKey}
  it("onSave for edit of projected event re-IDs to recorded_${eventKey}", async () => {
    const projected = makeEvent({ id: "proj-nap-1", eventKey: "nap_2" });
    const saveEvent = makeSaveEvent();
    const { result } = setup({ actuals: [], saveEvent });

    act(() => result.current.openEdit(projected));

    await act(async () => {
      await result.current.onSave(projected);
    });

    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "recorded_nap_2" }));
    expect(result.current.drawer).toEqual({ open: false });
  });

  it("projected event re-ID uses eventKey from the event passed to onSave", async () => {
    const projected = makeEvent({ id: "proj-bottle-3", eventKey: "bottle_3" });
    const saveEvent = makeSaveEvent();
    const { result } = setup({ actuals: [], saveEvent });

    act(() => result.current.openEdit(projected));

    await act(async () => {
      await result.current.onSave(projected);
    });

    expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "recorded_bottle_3" }));
  });

  // 7. onDelete where event is in actuals → deleteOptimistic(event.id)
  it("onDelete for persisted actual calls deleteOptimistic and closes", async () => {
    const actual = makeActualEvent({ id: "evt-actual-del", eventKey: "nap_1" });
    const deleteOptimistic = makeDeleteFn();
    const { result } = setup({ actuals: [actual], deleteOptimistic });

    act(() => result.current.openEdit(actual));

    await act(async () => {
      await result.current.onDelete(actual);
    });

    expect(deleteOptimistic).toHaveBeenCalledTimes(1);
    expect(deleteOptimistic).toHaveBeenCalledWith("evt-actual-del");
    expect(result.current.drawer).toEqual({ open: false });
  });

  // 8. onDelete where event is projected → just closes, no persist
  it("onDelete for projected event just closes without calling deleteOptimistic", async () => {
    const projected = makeEvent({ id: "proj-nap-1", eventKey: "nap_1" });
    const deleteOptimistic = makeDeleteFn();
    const { result } = setup({ actuals: [], deleteOptimistic });

    act(() => result.current.openEdit(projected));

    await act(async () => {
      await result.current.onDelete(projected);
    });

    expect(deleteOptimistic).not.toHaveBeenCalled();
    expect(result.current.drawer).toEqual({ open: false });
  });
});
