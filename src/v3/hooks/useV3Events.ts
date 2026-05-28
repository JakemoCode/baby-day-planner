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

  // Ref keeps saveEvent's identity stable across Firestore ticks without re-creating the callback.
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    // No dayId yet: skip subscription to avoid hitting Firestore with a placeholder id.
    if (!dayId) return;
    return watchEvents(db, childId, dayId, (next) => {
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

  // Routes create vs update by id presence in local actuals (via ref).
  // Contract: callers must preserve the event's id to route to update; saveEvent does not re-ID.
  // Full-event rewrite on update — stale tabs could clobber drifted server values.
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
