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
 * @param setOwnerOverride OPTIONAL — write a single owner override to
 *                  `Day.ownerOverrides[eventKey]` without anchoring the
 *                  event's time. When provided, owner-only edits on
 *                  projected events route here instead of through
 *                  `saveEvent`, keeping the event projected and letting
 *                  the cascade re-project its time freely. Without this
 *                  callback, the legacy behavior (write a recorded doc)
 *                  applies — used by /tomorrow page which has its own
 *                  ownerOverrides plumbing.
 */
export function useDrawer(
  actuals: Event[],
  saveEvent: (event: Event) => Promise<void> | void,
  deleteOptimistic: (eventId: string) => Promise<void> | void,
  setOwnerOverride?: (eventKey: string, owner: Event["owner"]) => Promise<void> | void,
  /**
   * §F65 OPTIONAL — when provided AND the deleted event is a
   * `daily_recurring`, route through `Day.suppressedRecurringIds`
   * (R11.6) instead of (or in addition to, if the event is also
   * recorded) the regular `deleteOptimistic` path. Caller closes
   * over the dayId and forwards to {@link suppressRecurringForDay}.
   */
  suppressRecurring?: (recurringId: string) => Promise<void> | void,
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
      const source = drawer.event;
      const isActual = actuals.some((e) => e.id === originalId);
      // Owner-only edit on a projected event: route to Day.ownerOverrides
      // so the cascade stays free to re-project the event's time. Without
      // this, the drawer's lifecycle-reducer would promote to "recorded"
      // and anchor the projected nap/bottle's time — bug Jake hit
      // 2026-05-24 (nap 4:35-5:20 stuck while bedtime threshold approached).
      if (
        !isActual &&
        setOwnerOverride &&
        source.lifecycle.state === "projected" &&
        isOwnerOnlyEdit(source, event)
      ) {
        await setOwnerOverride(event.eventKey, event.owner);
        setDrawer({ open: false });
        return;
      }
      if (!isActual) {
        // Projected event with a time/amount/label change: re-ID
        // deterministically so subsequent edits route through update
        // (not create) — fixes the intermittent wake-window owner bug
        // from PR #186.
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

  // True iff (a) every non-owner field is unchanged, AND (b) owner
  // actually differs. The owner-differs check matters: without it,
  // tapping Save with no changes at all would still fire a Firestore
  // write via setOwnerOverride. JSON.stringify is fine here — OwnerRef
  // is a flat object (slot + optional otherId).
  function isOwnerOnlyEdit(source: Event, edited: Event): boolean {
    if (source.startTime !== edited.startTime) return false;
    if (source.endTime !== edited.endTime) return false;
    if (source.amountOz !== edited.amountOz) return false;
    if (source.label !== edited.label) return false;
    return JSON.stringify(source.owner) !== JSON.stringify(edited.owner);
  }

  const onDelete = async (event: Event) => {
    if (drawer.open && drawer.mode === "edit") {
      const originalId = drawer.event.id;
      const isActual = actuals.some((e) => e.id === originalId);
      if (isActual) {
        await deleteOptimistic(event.id);
      }
      // §F65: recurring events live in Settings.dailyRecurring; the
      // engine projects them per-day via R11.2. "Delete from today"
      // ≠ "remove from settings" — instead suppress the recurring id
      // on this Day, which R11.6 honors. If the user had recorded the
      // event (above branch ran), the suppression *also* runs so the
      // freshly-deleted slot doesn't immediately re-project.
      if (suppressRecurring && event.type === "daily_recurring") {
        const recurringId = event.eventKey.startsWith("recurring:")
          ? event.eventKey.slice("recurring:".length)
          : event.eventKey;
        await suppressRecurring(recurringId);
      }
      // projected non-recurring: close only, no persist
    }
    setDrawer({ open: false });
  };

  return { drawer, openCreate, openEdit, close, onSave, onDelete };
}
