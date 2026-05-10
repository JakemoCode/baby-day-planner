"use client";

import { useCallback, useEffect, useState } from "react";
import type { Event } from "@/domain";
import { db } from "@/lib/firebase/client";
import {
  createEvent as createEventRepo,
  deleteEvent as deleteEventRepo,
  updateEvent as updateEventRepo,
  watchEvents,
} from "@/repositories/events";
import { withV2EventBackcompat } from "@/v3/firestore/v2Backcompat";

export type UseEventsResult = {
  events: Event[];
  loading: boolean;
  createOptimistic: (event: Event) => Promise<void>;
  updateOptimistic: (eventId: string, patch: Partial<Event>) => Promise<void>;
  deleteOptimistic: (eventId: string) => Promise<void>;
};

export function useEvents(childId: string, dayId: string): UseEventsResult {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Skip subscription when there's no day yet (e.g. dashboard before
    // "Start New Day" is tapped). Avoids hitting Firestore with a placeholder
    // doc ID, which trips reserved-id validation (`__.*__`).
    if (!dayId) return;
    return watchEvents(db, childId, dayId, (next) => {
      // Flow each doc through the V3 → V2 back-compat shim. V2 surfaces
      // (Dashboard, Tomorrow, History) keep working when /timeline (V3)
      // writes V3-shape event docs. Owner info on V3 docs is dropped
      // (slot identity can't survive the round-trip without OwnersConfig
      // here); cosmetic loss only — no crash.
      setEvents(next.map((e) => withV2EventBackcompat(e)));
      setLoading(false);
    });
  }, [childId, dayId]);

  const createOptimistic = useCallback(
    async (event: Event) => {
      setEvents((prev) => [...prev, event].sort((a, b) => a.startTime.localeCompare(b.startTime)));
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

  return { events, loading, createOptimistic, updateOptimistic, deleteOptimistic };
}
