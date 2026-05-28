"use client";

/**
 * Persists engine-auto-promoted bottles to Firestore so their
 * "recorded" status survives the next engine pass.
 *
 * Without this, auto-promote (evaluator.ts Now-cross) only flips
 * lifecycle in engine output. The next pass re-derives the cascade
 * from scratch using only Firestore actuals; if a real recording
 * exists later in the day, R5's anchored branch suppresses cold-start
 * emission and the auto-promoted morning bottles vanish from the
 * timeline (§F66 fast-follow B5 bug).
 *
 * Persistence philosophy (Jake 2026-05-27): "the schedule is
 * projected and we're going to do our best to follow it; we might
 * forget to log something here and there." Auto-persisted morning
 * bottles are best-guess recordings. The user can delete any that
 * didn't actually happen via the drawer.
 *
 * Idempotency + race safety:
 *   - The write is wrapped in a Firestore transaction that bails if
 *     the doc already exists. Critical: without this, a queued
 *     setDoc could overwrite a user's drawer edit that landed
 *     between the auto-promote pass and Firestore commit (Jake's
 *     2026-05-27 dogfood: edits to auto-promoted bottles silently
 *     reverted to the original cascade time).
 *   - Session-level `writtenIds` ref skips redundant transactions
 *     between a successful write and the snapshot round-trip back
 *     through `actuals`.
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
      // Only bottles auto-promote into recorded "best-guess" state.
      // Naps / bedtime have explicit confirmation flows (End nap,
      // wake-confirm sheet) that own their own write paths.
      if (e.type !== "bottle") continue;
      // Dream-feed has its own per-day suppression path
      // (Day.suppressedDreamFeed). Auto-persisting it would create a
      // second write path that bypasses the suppression-from-emission
      // model the rest of the dream-feed code uses.
      if (e.eventKey === DREAM_FEED_EVENT_KEY) continue;
      if (e.lifecycle.state === "projected") continue;
      // Already-persisted events have non-"proj_" ids — their
      // lifecycle came from Firestore, not from auto-promote.
      if (!isEngineEmittedId(e.id)) continue;
      const recordedId = recordedIdFor(e.eventKey);
      if (actualIds.has(recordedId)) continue;
      // §F66 review: cache key MUST include dayId. The Firestore path
      // is dayId-scoped but recordedId alone collides across days,
      // so Day B's bottle_1 was silently skipped after Day A persisted
      // its bottle_1 (dev StartDayButton wipes events but the hook
      // stays mounted with stale writtenIds).
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
        // Bail when the doc already exists — could be from a parallel
        // tab's auto-promote, a manual Log Bottle Now, or (the bug
        // this guards) a user drawer edit that just landed.
        if (snap.exists()) return;
        tx.set(ref, toWrite);
      }).catch((err) => {
        // Transaction failed (offline, permissions, races outside the
        // transaction's view). Remove from session cache so the next
        // render retries.
        writtenIds.current.delete(cacheKey);
        console.warn("[auto-promote] persist failed", recordedId, err);
      });
    }
  }, [input.db, input.childId, input.projected, input.actuals]);
}
