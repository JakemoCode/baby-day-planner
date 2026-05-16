"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/firebase/client";
import {
  createEvent as createEventRepo,
  deleteEvent as deleteEventRepo,
  updateEvent as updateEventRepo,
  watchEvents,
} from "../repositories/events";
import type { Event } from "../schemas";

export type UseV3EventsResult = {
  events: Event[];
  loading: boolean;
  saveEvent: (event: Event) => Promise<void>;
  deleteOptimistic: (eventId: string) => Promise<void>;
};

export function useV3Events(childId: string, dayId: string): UseV3EventsResult {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  // Mirror `events` into a ref so `saveEvent`'s routing predicate can read
  // the latest value without re-creating the callback on every Firestore
  // tick. Keeps `saveEvent`'s identity stable across snapshots — avoids
  // cascading re-renders / effect re-runs in downstream consumers.
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    // Skip subscription when there's no day yet (e.g. dashboard before
    // the first "Start Day"). Avoids hitting Firestore with a placeholder
    // doc id, which trips reserved-id validation (`__.*__`).
    if (!dayId) return;
    return watchEvents(db, childId, dayId, (next) => {
      // The v3EventConverter already applies withV3EventDefaults on read;
      // events arrive here fully defaulted.
      setEvents(next);
      setLoading(false);
    });
  }, [childId, dayId]);

  const createOptimistic = useCallback(
    async (event: Event) => {
      setEvents((prev) => [...prev, event].sort((a, b) => a.startTime - b.startTime));
      await createEventRepo(db, childId, event);
    },
    [childId],
  );

  const updateOptimistic = useCallback(
    async (eventId: string, patch: Partial<Event>) => {
      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, ...patch } : e)));
      await updateEventRepo(db, childId, dayId, eventId, patch);
    },
    [childId, dayId],
  );

  const deleteOptimistic = useCallback(
    async (eventId: string) => {
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      await deleteEventRepo(db, childId, dayId, eventId);
    },
    [childId, dayId],
  );

  // Routes create vs update based on whether the event already exists in
  // local actuals (read via ref — see eventsRef above for why). Inlines
  // the isPersistedActual predicate; one routing decision, not N
  // duplicated across call sites.
  //
  // Two contracts the callers rely on:
  // 1. ID-based routing only — `saveEvent` does not re-ID. If a caller
  //    passes an event whose id differs from any persisted event, it
  //    routes to CREATE. Callers that want to update an existing event
  //    must preserve its id (use spread: `{ ...existing, ...patch }`).
  // 2. Full-event rewrite on update — `saveEvent` passes the full event
  //    as the updateDoc patch. updateDoc is field-merge, so unknown
  //    server-side fields stay untouched, but every field present in the
  //    in-memory event gets overwritten. Relies on realtime-subscription
  //    freshness; stale tabs could clobber server values that drifted.
  const saveEvent = useCallback(
    async (event: Event) => {
      const isExisting = eventsRef.current.some((e) => e.id === event.id);
      if (isExisting) {
        await updateOptimistic(event.id, event);
      } else {
        await createOptimistic(event);
      }
    },
    [createOptimistic, updateOptimistic],
  );

  return { events, loading, saveEvent, deleteOptimistic };
}
