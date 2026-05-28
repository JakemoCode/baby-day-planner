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

function makeSetOwnerOverride() {
  const fn = vi.fn();
  fn.mockResolvedValue(undefined);
  return fn as unknown as ((eventKey: string, owner: Event["owner"]) => Promise<void>) &
    ReturnType<typeof vi.fn>;
}

function makeSuppressRecurring() {
  const fn = vi.fn();
  fn.mockResolvedValue(undefined);
  return fn as unknown as ((recurringId: string) => Promise<void>) & ReturnType<typeof vi.fn>;
}

function setup({
  actuals = [] as Event[],
  saveEvent = makeSaveEvent(),
  deleteOptimistic = makeDeleteFn(),
  setOwnerOverride,
  suppressRecurring,
}: {
  actuals?: Event[];
  saveEvent?: ((event: Event) => Promise<void>) & ReturnType<typeof vi.fn>;
  deleteOptimistic?: ((eventId: string) => Promise<void>) & ReturnType<typeof vi.fn>;
  setOwnerOverride?: ((eventKey: string, owner: Event["owner"]) => Promise<void>) &
    ReturnType<typeof vi.fn>;
  suppressRecurring?: ((recurringId: string) => Promise<void>) & ReturnType<typeof vi.fn>;
} = {}) {
  // §F66 fast-follow: useDrawer now takes a `DrawerSuppression[]` array
  // instead of one optional callback per type. Tests build the array
  // from the explicit `suppressRecurring` arg.
  const suppressions = suppressRecurring
    ? [
        {
          matches: (e: Event) => e.type === "daily_recurring",
          apply: (e: Event) => {
            const id = e.eventKey.startsWith("recurring:")
              ? e.eventKey.slice("recurring:".length)
              : e.eventKey;
            return suppressRecurring(id);
          },
        },
      ]
    : [];
  const result = renderHook(() =>
    useDrawer(actuals, saveEvent, deleteOptimistic, setOwnerOverride, suppressions),
  );
  return { ...result, saveEvent, deleteOptimistic, setOwnerOverride, suppressRecurring };
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

  // §F63: owner-only edit on projected event → setOwnerOverride, NOT saveEvent.
  // Without this routing, the lifecycle reducer promotes the projected nap
  // to "recorded", which anchors its time and prevents the cascade from
  // re-projecting. Jake hit this 2026-05-24 — nap 4:35-5:20 stuck while
  // bedtime threshold approached because owner was assigned hours earlier.
  it("owner-only edit on projected event routes to setOwnerOverride (not saveEvent)", async () => {
    const projected = makeEvent({ id: "proj-nap-3", eventKey: "nap_3" });
    const saveEvent = makeSaveEvent();
    const setOwnerOverride = makeSetOwnerOverride();
    const { result } = setup({ actuals: [], saveEvent, setOwnerOverride });

    act(() => result.current.openEdit(projected));

    const newOwner = { slot: "parent2" as const };
    const edited = { ...projected, owner: newOwner };
    await act(async () => {
      await result.current.onSave(edited);
    });

    expect(setOwnerOverride).toHaveBeenCalledTimes(1);
    expect(setOwnerOverride).toHaveBeenCalledWith("nap_3", newOwner);
    expect(saveEvent).not.toHaveBeenCalled();
    expect(result.current.drawer).toEqual({ open: false });
  });

  it("time edit on projected event still routes to saveEvent (not setOwnerOverride)", async () => {
    const projected = makeEvent({ id: "proj-nap-3", eventKey: "nap_3" });
    const saveEvent = makeSaveEvent();
    const setOwnerOverride = makeSetOwnerOverride();
    const { result } = setup({ actuals: [], saveEvent, setOwnerOverride });

    act(() => result.current.openEdit(projected));

    // User changes startTime AND owner — time-change forces a recorded
    // doc (cascade should re-anchor, not push the nap).
    const edited = {
      ...projected,
      startTime: 10 * 60 + 30,
      owner: { slot: "parent2" as const },
    };
    await act(async () => {
      await result.current.onSave(edited);
    });

    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(saveEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "recorded_nap_3", startTime: 10 * 60 + 30 }),
    );
    expect(setOwnerOverride).not.toHaveBeenCalled();
  });

  it("owner-only edit on a persisted actual still routes to saveEvent (overrides only apply to projected)", async () => {
    const actual = makeActualEvent({
      id: "evt-actual-nap1",
      eventKey: "nap_1",
      lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
    });
    const saveEvent = makeSaveEvent();
    const setOwnerOverride = makeSetOwnerOverride();
    const { result } = setup({ actuals: [actual], saveEvent, setOwnerOverride });

    act(() => result.current.openEdit(actual));

    const edited = { ...actual, owner: { slot: "parent2" as const } };
    await act(async () => {
      await result.current.onSave(edited);
    });

    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(setOwnerOverride).not.toHaveBeenCalled();
  });

  it("falls back to legacy recorded-doc path when setOwnerOverride callback is omitted", async () => {
    const projected = makeEvent({ id: "proj-nap-3", eventKey: "nap_3" });
    const saveEvent = makeSaveEvent();
    // Note: no setOwnerOverride passed — simulates the /tomorrow page
    // which has its own ownerOverrides plumbing.
    const { result } = setup({ actuals: [], saveEvent });

    act(() => result.current.openEdit(projected));

    const edited = { ...projected, owner: { slot: "parent2" as const } };
    await act(async () => {
      await result.current.onSave(edited);
    });

    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "recorded_nap_3" }));
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

  // §F65 — daily_recurring delete routes through suppressRecurring,
  // not through Firestore doc deletion (the recurring is projected, not
  // persisted as a Day event).
  it("onDelete on a projected daily_recurring routes through suppressRecurring", async () => {
    const recurring = makeEvent({
      id: "proj_recurring:rec-tummy",
      eventKey: "recurring:rec-tummy",
      type: "daily_recurring",
      kind: "instant",
      label: "Tummy time",
    });
    const deleteOptimistic = makeDeleteFn();
    const suppressRecurring = makeSuppressRecurring();
    const { result } = setup({ actuals: [], deleteOptimistic, suppressRecurring });

    act(() => result.current.openEdit(recurring));
    await act(async () => {
      await result.current.onDelete(recurring);
    });

    expect(suppressRecurring).toHaveBeenCalledTimes(1);
    expect(suppressRecurring).toHaveBeenCalledWith("rec-tummy");
    expect(deleteOptimistic).not.toHaveBeenCalled();
    expect(result.current.drawer).toEqual({ open: false });
  });

  it("onDelete on a recorded daily_recurring deletes the doc AND suppresses for the day", async () => {
    // User recorded a recurring event then changed their mind — both
    // the persisted doc and the projection-suppression need to run so
    // the slot stays empty for the rest of the day.
    const recurring = makeActualEvent({
      id: "recorded_recurring:rec-tummy",
      eventKey: "recurring:rec-tummy",
      type: "daily_recurring",
      kind: "instant",
      label: "Tummy time",
    });
    const deleteOptimistic = makeDeleteFn();
    const suppressRecurring = makeSuppressRecurring();
    const { result } = setup({
      actuals: [recurring],
      deleteOptimistic,
      suppressRecurring,
    });

    act(() => result.current.openEdit(recurring));
    await act(async () => {
      await result.current.onDelete(recurring);
    });

    expect(deleteOptimistic).toHaveBeenCalledWith("recorded_recurring:rec-tummy");
    expect(suppressRecurring).toHaveBeenCalledWith("rec-tummy");
    expect(result.current.drawer).toEqual({ open: false });
  });

  it("onDelete on a daily_recurring falls back to plain delete when suppressRecurring is not wired", async () => {
    // Defensive: pages that don't pass the suppress callback (e.g. a
    // read-only history view) shouldn't crash on a recurring delete.
    const recurring = makeActualEvent({
      id: "recorded_recurring:rec-tummy",
      eventKey: "recurring:rec-tummy",
      type: "daily_recurring",
      kind: "instant",
      label: "Tummy time",
    });
    const deleteOptimistic = makeDeleteFn();
    const { result } = setup({ actuals: [recurring], deleteOptimistic });

    act(() => result.current.openEdit(recurring));
    await act(async () => {
      await result.current.onDelete(recurring);
    });

    expect(deleteOptimistic).toHaveBeenCalledWith("recorded_recurring:rec-tummy");
    expect(result.current.drawer).toEqual({ open: false });
  });
});
