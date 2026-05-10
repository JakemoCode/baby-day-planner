"use client";

import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { withV3EventDefaults } from "../firestore/eventDefaults";
import {
  createEvent as createEventRepo,
  deleteEvent as deleteEventRepo,
  updateEvent as updateEventRepo,
  watchEvents,
} from "../repositories/events";
import type { Event, OwnersConfig } from "../schemas";

export type UseV3EventsResult = {
  events: Event[];
  loading: boolean;
  createOptimistic: (event: Event) => Promise<void>;
  updateOptimistic: (eventId: string, patch: Partial<Event>) => Promise<void>;
  deleteOptimistic: (eventId: string) => Promise<void>;
};

export function useV3Events(
  childId: string,
  dayId: string,
  owners?: OwnersConfig,
): UseV3EventsResult {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Skip subscription when there's no day yet (e.g. dashboard before
    // the first "Start Day"). Avoids hitting Firestore with a placeholder
    // doc id, which trips reserved-id validation (`__.*__`).
    if (!dayId) return;
    return watchEvents(db, childId, dayId, (next) => {
      // Flow each doc through withV3EventDefaults so V2-shape leftovers
      // (string startTime, source/status/recorded triplet, missing
      // lifecycle / kind / hasPutdown) don't crash the engine. Pass the
      // owners config so V2 string `owner` display names can be resolved
      // back to the correct slot ref. Removed once V2 reads stop entirely.
      setEvents(next.map((e) => withV3EventDefaults(e, owners)));
      setLoading(false);
    });
  }, [childId, dayId, owners]);

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

  return { events, loading, createOptimistic, updateOptimistic, deleteOptimistic };
}
