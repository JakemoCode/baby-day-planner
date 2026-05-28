"use client";

/**
 * Persists engine-auto-promoted bottles to Firestore so "recorded" status survives the next pass.
 * Without this, a real recording later in the day suppresses cold-start emission and the
 * morning bottles vanish (R5 anchored branch).
 *
 * Race safety: uses a Firestore transaction that bails when the doc already exists —
 * prevents overwriting a user's drawer edit that lands between auto-promote and commit.
 * Session `writtenIds` ref skips redundant transactions before the snapshot round-trips.
 */

import { useEffect, useRef } from "react";
import { doc, runTransaction, type Firestore } from "firebase/firestore";
import { v3EventConverter } from "../firestore/converters";
import { eventPath } from "@/lib/firestore/paths";
import type { Event } from "../schemas";
import { DREAM_FEED_EVENT_KEY, isEngineEmittedId, recordedIdFor } from "../lib/eventConventions";

export type UseAutoPromotePersistenceInput = {
  db: Firestore | null;
  childId: string | null;
  projected: Event[];
  actuals: Event[];
};

export function useAutoPromotePersistence(input: UseAutoPromotePersistenceInput): void {
  const writtenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (input.db === null || input.childId === null) return;
    const db = input.db;
    const childId = input.childId;

    const actualIds = new Set(input.actuals.map((a) => a.id));

    for (const e of input.projected) {
      // Only bottles auto-promote; naps/bedtime have explicit confirmation flows.
      if (e.type !== "bottle") continue;
      // Dream-feed uses Day.suppressedDreamFeed; auto-persisting it would bypass that path.
      if (e.eventKey === DREAM_FEED_EVENT_KEY) continue;
      if (e.lifecycle.state === "projected") continue;
      // Already-persisted events have non-"proj_" ids.
      if (!isEngineEmittedId(e.id)) continue;
      const recordedId = recordedIdFor(e.eventKey);
      if (actualIds.has(recordedId)) continue;
      // Cache key must include dayId: recordedId alone collides across days
      // (hook stays mounted across day-rolls with stale writtenIds).
      const cacheKey = `${e.dayId}:${recordedId}`;
      if (writtenIds.current.has(cacheKey)) continue;

      writtenIds.current.add(cacheKey);
      const toWrite: Event = { ...e, id: recordedId };
      const childIdForWrite = childId;
      const dayIdForWrite = e.dayId;
      void runTransaction(db, async (tx) => {
        const ref = doc(db, eventPath(childIdForWrite, dayIdForWrite, recordedId)).withConverter(
          v3EventConverter,
        );
        const snap = await tx.get(ref);
        // Bail if doc exists (parallel tab, manual log, or in-flight drawer edit).
        if (snap.exists()) return;
        tx.set(ref, toWrite);
      }).catch((err) => {
        // Transaction failed — evict from cache so the next render retries.
        writtenIds.current.delete(cacheKey);
        console.warn("[auto-promote] persist failed", recordedId, err);
      });
    }
  }, [input.db, input.childId, input.projected, input.actuals]);
}
