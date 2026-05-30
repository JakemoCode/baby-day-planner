"use client";

/**
 * Manages drawer state and the projected-event re-save protocol.
 * Standardizes on deterministic `recorded_${eventKey}` re-IDs for projected saves
 * (random re-IDs caused intermittent wake-window owner bugs).
 */

import { useState } from "react";
import type { Event } from "../schemas";
import { recordedIdFor } from "../lib/eventConventions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DrawerState =
  | { open: false }
  | { open: true; mode: "create"; template: Event }
  | { open: true; mode: "edit"; event: Event };

/**
 * Translates a drawer-delete on a projected event into a per-day suppression write.
 * Multiple matchers can fire; the recorded-doc delete is independent and always runs.
 */
export type DrawerSuppression = {
  matches: (event: Event) => boolean;
  apply: (event: Event) => Promise<void> | void;
};

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

type UseDrawerOptions = {
  /** Persisted events for today; determines projected vs actual routing. */
  actuals: Event[];
  /** Write a single event (create or update). */
  saveEvent: (event: Event) => Promise<void> | void;
  /** Delete by id; only called for confirmed actuals. */
  deleteOptimistic: (eventId: string) => Promise<void> | void;
  /**
   * When provided, owner-only edits on projected events route here instead of
   * saveEvent, keeping the cascade free to re-project times.
   */
  setOwnerOverride?: (eventKey: string, owner: Event["owner"]) => Promise<void> | void;
  /** Per-day suppression rules; "delete" on these means "skip today". See {@link DrawerSuppression}. */
  suppressions?: DrawerSuppression[];
  /**
   * Create-mode override (DOMAIN §2 midnight rule). When provided, a NEW event
   * routes here instead of `saveEvent` so it can land on the calendar day its
   * clock time falls on. Edits always use `saveEvent` (they keep their day).
   */
  saveNewEvent?: (event: Event) => Promise<void> | void;
};

export function useDrawer({
  actuals,
  saveEvent,
  deleteOptimistic,
  setOwnerOverride,
  suppressions = [],
  saveNewEvent,
}: UseDrawerOptions): UseDrawerResult {
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
      // Owner-only edit on a projected event: route to Day.ownerOverrides so the cascade
      // stays free to re-project times. saveEvent would anchor the slot as "recorded".
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
        // Projected with time/amount/label change: re-ID deterministically so
        // subsequent edits route through update rather than create.
        await saveEvent({ ...event, id: recordedIdFor(event.eventKey) });
      } else {
        await saveEvent(event);
      }
    } else {
      await (saveNewEvent ?? saveEvent)(event);
    }
    setDrawer({ open: false });
  };

  // Returns true only when owner changed AND all other fields are identical.
  // JSON.stringify is safe: OwnerRef is a flat object.
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
      // Run suppressions; both the doc-delete above and these are independent and can both fire.
      for (const s of suppressions) {
        if (s.matches(event)) await s.apply(event);
      }
    }
    setDrawer({ open: false });
  };

  return { drawer, openCreate, openEdit, close, onSave, onDelete };
}
