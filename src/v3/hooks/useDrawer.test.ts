/**
 * useDrawer — projected-event re-save protocol.
 * Covers create/edit modes, projected-event re-ID, owner-override routing, and delete paths.
 */

import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Event } from "../schemas";
import { NO_OWNER } from "../schemas";
import { useDrawer } from "./useDrawer";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Projected events carry an engine-emitted `proj_` id; `useDrawer` routes on that
// prefix (isEngineEmittedId), not on membership in an actuals list (§F59).
function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "proj_nap_1",
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
  saveEvent = makeSaveEvent(),
  deleteOptimistic = makeDeleteFn(),
  setOwnerOverride,
  suppressRecurring,
  saveNewEvent,
}: {
  saveEvent?: ((event: Event) => Promise<void>) & ReturnType<typeof vi.fn>;
  deleteOptimistic?: ((eventId: string) => Promise<void>) & ReturnType<typeof vi.fn>;
  setOwnerOverride?: ((eventKey: string, owner: Event["owner"]) => Promise<void>) &
    ReturnType<typeof vi.fn>;
  suppressRecurring?: ((recurringId: string) => Promise<void>) & ReturnType<typeof vi.fn>;
  saveNewEvent?: ((event: Event) => Promise<void>) & ReturnType<typeof vi.fn>;
} = {}) {
  // Build DrawerSuppression[] from the explicit suppressRecurring arg.
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
    useDrawer({
      saveEvent,
      deleteOptimistic,
      suppressions,
      ...(setOwnerOverride ? { setOwnerOverride } : {}),
      ...(saveNewEvent ? { saveNewEvent } : {}),
    }),
  );
  return {
    ...result,
    saveEvent,
    deleteOptimistic,
    setOwnerOverride,
    suppressRecurring,
    saveNewEvent,
  };
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

  it("onSave in create mode routes through saveNewEvent when provided, bypassing saveEvent", async () => {
    const saveEvent = makeSaveEvent();
    const saveNewEvent = makeSaveEvent();
    const { result } = setup({ saveEvent, saveNewEvent });
    const template = makeEvent({ id: "tpl-1", eventKey: "bottle_1" });

    act(() => result.current.openCreate(template));
    await act(async () => {
      await result.current.onSave(template);
    });

    expect(saveNewEvent).toHaveBeenCalledWith(template);
    expect(saveEvent).not.toHaveBeenCalled();
  });

  it("onSave in edit mode uses saveEvent even when saveNewEvent is provided", async () => {
    const saveEvent = makeSaveEvent();
    const saveNewEvent = makeSaveEvent();
    const actual = makeActualEvent({ eventKey: "bottle_1" });
    const { result } = setup({ saveEvent, saveNewEvent });

    act(() => result.current.openEdit(actual));
    await act(async () => {
      await result.current.onSave({ ...actual, amountOz: 6 });
    });

    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(saveNewEvent).not.toHaveBeenCalled();
  });

  // 5. onSave on a persisted (non-`proj_` id) event — preserves the id
  it("onSave for edit of persisted actual preserves the event id", async () => {
    const actual = makeActualEvent({ id: "evt-actual-1", eventKey: "nap_1" });
    const saveEvent = makeSaveEvent();
    const { result } = setup({ saveEvent });

    act(() => result.current.openEdit(actual));

    const updated = { ...actual, startTime: 10 * 60 };
    await act(async () => {
      await result.current.onSave(updated);
    });

    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "evt-actual-1" }));
    expect(result.current.drawer).toEqual({ open: false });
  });

  // 6. onSave on a projected (`proj_` id) event — re-ID to recorded_${eventKey}
  it("onSave for edit of projected event re-IDs to recorded_${eventKey}", async () => {
    const projected = makeEvent({ id: "proj_nap_1", eventKey: "nap_2" });
    const saveEvent = makeSaveEvent();
    const { result } = setup({ saveEvent });

    act(() => result.current.openEdit(projected));

    await act(async () => {
      await result.current.onSave(projected);
    });

    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "recorded_nap_2" }));
    expect(result.current.drawer).toEqual({ open: false });
  });

  it("projected BOTTLE re-IDs to recorded_bottle_t<startTime> (renumber-independent, §F66)", async () => {
    const projected = makeEvent({
      id: "proj_bottle_t600",
      type: "bottle",
      kind: "instant",
      eventKey: "bottle_3", // renumbering slot — must NOT key the doc id
      label: "Bottle 2",
      startTime: 10 * 60,
    });
    const saveEvent = makeSaveEvent();
    const { result } = setup({ saveEvent });

    act(() => result.current.openEdit(projected));

    await act(async () => {
      await result.current.onSave(projected);
    });

    expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "recorded_bottle_t600" }));
  });

  // BOTTLE_SPEC §4: editing a projected bottle realizes that forecast slot. The
  // recorded doc is tagged so the cascade absorbs the slot (no duplicate beside it).
  it("projected BOTTLE edit tags realizedForecast: true", async () => {
    const projected = makeEvent({
      id: "proj_bottle_t600",
      type: "bottle",
      kind: "instant",
      eventKey: "bottle_1",
      startTime: 10 * 60,
    });
    const saveEvent = makeSaveEvent();
    const { result } = setup({ saveEvent });

    act(() => result.current.openEdit(projected));
    await act(async () => {
      await result.current.onSave({ ...projected, startTime: 10 * 60 + 30 });
    });

    expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ realizedForecast: true }));
  });

  // The tag is bottle-only: a projected nap edit must NOT carry it.
  it("projected NAP edit does not tag realizedForecast", async () => {
    const projected = makeEvent({ id: "proj_nap_5", eventKey: "nap_5" });
    const saveEvent = makeSaveEvent();
    const { result } = setup({ saveEvent });

    act(() => result.current.openEdit(projected));
    await act(async () => {
      await result.current.onSave({ ...projected, startTime: 11 * 60 });
    });

    const saved = saveEvent.mock.calls[0]![0] as Event;
    expect(saved.realizedForecast).toBeUndefined();
  });

  // owner-only edit on projected event must route to setOwnerOverride, not saveEvent.
  // saveEvent would promote to recorded, anchoring time and preventing cascade re-projection.
  it("owner-only edit on projected event routes to setOwnerOverride (not saveEvent)", async () => {
    const projected = makeEvent({ id: "proj_nap_3", eventKey: "nap_3" });
    const saveEvent = makeSaveEvent();
    const setOwnerOverride = makeSetOwnerOverride();
    const { result } = setup({ saveEvent, setOwnerOverride });

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

  // §F66: a bottle owner-only edit keys the per-day override by chronological
  // position (from the label), not the renumbering eventKey slot.
  it("owner-only edit on a projected BOTTLE routes to setOwnerOverride with the positional key", async () => {
    const projected = makeEvent({
      id: "proj_bottle_t600",
      type: "bottle",
      kind: "instant",
      eventKey: "bottle_3",
      label: "Bottle 2",
      startTime: 10 * 60,
    });
    const saveEvent = makeSaveEvent();
    const setOwnerOverride = makeSetOwnerOverride();
    const { result } = setup({ saveEvent, setOwnerOverride });

    act(() => result.current.openEdit(projected));

    const newOwner = { slot: "parent2" as const };
    await act(async () => {
      await result.current.onSave({ ...projected, owner: newOwner });
    });

    expect(setOwnerOverride).toHaveBeenCalledWith("bottle_pos_2", newOwner);
    expect(saveEvent).not.toHaveBeenCalled();
  });

  // §F72: a daily_recurring owner edit must be per-DAY (Day.ownerOverrides), never a
  // permanent change to the Settings template. setOwnerOverride is the per-day path;
  // saveEvent (or a settings write) would leak the owner into future days.
  it("owner edit on a projected daily_recurring routes to setOwnerOverride (per-day, not the template)", async () => {
    const recurring = makeEvent({
      id: "proj_recurring_meds",
      eventKey: "recurring_meds",
      type: "daily_recurring",
      label: "Morning meds",
      startTime: 8 * 60,
    });
    const saveEvent = makeSaveEvent();
    const setOwnerOverride = makeSetOwnerOverride();
    const { result } = setup({ saveEvent, setOwnerOverride });

    act(() => result.current.openEdit(recurring));

    const newOwner = { slot: "parent1" as const };
    await act(async () => {
      await result.current.onSave({ ...recurring, owner: newOwner });
    });

    expect(setOwnerOverride).toHaveBeenCalledTimes(1);
    expect(setOwnerOverride).toHaveBeenCalledWith("recurring_meds", newOwner);
    expect(saveEvent).not.toHaveBeenCalled();
  });

  it("time edit on projected event still routes to saveEvent (not setOwnerOverride)", async () => {
    const projected = makeEvent({ id: "proj_nap_3", eventKey: "nap_3" });
    const saveEvent = makeSaveEvent();
    const setOwnerOverride = makeSetOwnerOverride();
    const { result } = setup({ saveEvent, setOwnerOverride });

    act(() => result.current.openEdit(projected));

    // Time change forces a recorded doc — cascade re-anchors from the new time.
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
    const { result } = setup({ saveEvent, setOwnerOverride });

    act(() => result.current.openEdit(actual));

    const edited = { ...actual, owner: { slot: "parent2" as const } };
    await act(async () => {
      await result.current.onSave(edited);
    });

    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(setOwnerOverride).not.toHaveBeenCalled();
  });

  it("falls back to legacy recorded-doc path when setOwnerOverride callback is omitted", async () => {
    const projected = makeEvent({ id: "proj_nap_3", eventKey: "nap_3" });
    const saveEvent = makeSaveEvent();
    // No setOwnerOverride: simulates pages (e.g. /tomorrow) with their own plumbing.
    const { result } = setup({ saveEvent });

    act(() => result.current.openEdit(projected));

    const edited = { ...projected, owner: { slot: "parent2" as const } };
    await act(async () => {
      await result.current.onSave(edited);
    });

    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "recorded_nap_3" }));
  });

  // 7. onDelete on a persisted (non-`proj_` id) event → deleteOptimistic(event.id)
  it("onDelete for persisted actual calls deleteOptimistic and closes", async () => {
    const actual = makeActualEvent({ id: "evt-actual-del", eventKey: "nap_1" });
    const deleteOptimistic = makeDeleteFn();
    const { result } = setup({ deleteOptimistic });

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
    const projected = makeEvent({ id: "proj_nap_1", eventKey: "nap_1" });
    const deleteOptimistic = makeDeleteFn();
    const { result } = setup({ deleteOptimistic });

    act(() => result.current.openEdit(projected));

    await act(async () => {
      await result.current.onDelete(projected);
    });

    expect(deleteOptimistic).not.toHaveBeenCalled();
    expect(result.current.drawer).toEqual({ open: false });
  });

  // projected daily_recurring delete routes through suppressRecurring, not Firestore doc delete.
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
    const { result } = setup({ deleteOptimistic, suppressRecurring });

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
    // Both doc delete and suppression must run so the slot stays empty for the day.
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
    // Pages without a suppress callback (e.g. read-only history) must not crash.
    const recurring = makeActualEvent({
      id: "recorded_recurring:rec-tummy",
      eventKey: "recurring:rec-tummy",
      type: "daily_recurring",
      kind: "instant",
      label: "Tummy time",
    });
    const deleteOptimistic = makeDeleteFn();
    const { result } = setup({ deleteOptimistic });

    act(() => result.current.openEdit(recurring));
    await act(async () => {
      await result.current.onDelete(recurring);
    });

    expect(deleteOptimistic).toHaveBeenCalledWith("recorded_recurring:rec-tummy");
    expect(result.current.drawer).toEqual({ open: false });
  });
});
