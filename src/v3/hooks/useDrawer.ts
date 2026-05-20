"use client";

/**
 * useDrawer — concentrated projected-event re-save protocol.
 *
 * Owns:
 *   - DrawerState discriminated union
 *   - The projected-vs-persisted predicate (is event in actuals?)
 *   - The `recorded_${eventKey}` re-ID strategy (PR #186 fix, applied
 *     consistently to all three pages that edit projected events)
 *   - onDelete routing: projected → close only; actual → deleteOptimistic
 *
 * Prior to this hook, Dashboard used `newEventId("manual")` (random re-ID)
 * while Timeline used `recorded_${eventKey}` (deterministic). The random
 * re-ID caused "intermittent wake-window owner change" bugs (PR #186).
 * This hook standardizes on the deterministic form everywhere.
 */

import { useState } from "react";
import type { Event } from "../schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DrawerState =
  | { open: false }
  | { open: true; mode: "create"; template: Event }
  | { open: true; mode: "edit"; event: Event };

export type UseDrawerResult = {
  drawer: DrawerState;
  openCreate: (template: Event) => void;
  openEdit: (event: Event) => void;
  close: () => void;
  onSave: (event: Event) => Promise<void>;
  onDelete: (event: Event) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param actuals   The persisted/recorded events for this day. Used to
 *                  determine whether an edited event is a projected slot
 *                  (not yet in actuals) or a real persisted doc.
 * @param saveEvent Write a single event. Routing (create vs update) is
 *                  the responsibility of the caller (e.g. useV3Events.saveEvent
 *                  or a local-state updater for the Tomorrow page).
 * @param deleteOptimistic Delete an event by id. Only called for events
 *                  that are confirmed to be in actuals.
 */
export function useDrawer(
  actuals: Event[],
  saveEvent: (event: Event) => Promise<void> | void,
  deleteOptimistic: (eventId: string) => Promise<void> | void,
): UseDrawerResult {
  const [drawer, setDrawer] = useState<DrawerState>({ open: false });

  const openCreate = (template: Event) => {
    setDrawer({ open: true, mode: "create", template });
  };

  const openEdit = (event: Event) => {
    setDrawer({ open: true, mode: "edit", event });
  };

  const close = () => {
    setDrawer({ open: false });
  };

  const onSave = async (event: Event) => {
    if (drawer.open && drawer.mode === "edit") {
      const originalId = drawer.event.id;
      const isActual = actuals.some((e) => e.id === originalId);
      if (!isActual) {
        // Projected event: re-ID deterministically so subsequent edits
        // route through update (not create) — fixes the intermittent
        // wake-window owner bug from PR #186.
        await saveEvent({ ...event, id: `recorded_${event.eventKey}` });
      } else {
        await saveEvent(event);
      }
    } else {
      // create mode: persist as-is
      await saveEvent(event);
    }
    setDrawer({ open: false });
  };

  const onDelete = async (event: Event) => {
    if (drawer.open && drawer.mode === "edit") {
      const originalId = drawer.event.id;
      const isActual = actuals.some((e) => e.id === originalId);
      if (isActual) {
        await deleteOptimistic(event.id);
      }
      // projected: close only, no persist
    }
    setDrawer({ open: false });
  };

  return { drawer, openCreate, openEdit, close, onSave, onDelete };
}
