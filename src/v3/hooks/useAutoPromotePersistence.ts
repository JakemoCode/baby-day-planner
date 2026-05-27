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
 * Idempotency:
 *   - Deterministic id (`recorded_${eventKey}`) collides across tabs/
 *     devices — last setDoc wins, content is deterministic so no
 *     observable difference.
 *   - Session-level `writtenIds` ref skips redundant writes between
 *     a successful write and the snapshot round-trip that puts the
 *     bottle into `actuals`.
 */

import { useEffect, useRef } from "react";
import type { Firestore } from "firebase/firestore";
import { createEvent } from "../repositories/events";
import type { Event } from "../schemas";

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
      if (e.lifecycle.state === "projected") continue;
      // Already-persisted events have non-"proj_" ids — their
      // lifecycle came from Firestore, not from auto-promote.
      if (!e.id.startsWith("proj_")) continue;
      const recordedId = `recorded_${e.eventKey}`;
      if (actualIds.has(recordedId)) continue;
      if (writtenIds.current.has(recordedId)) continue;

      writtenIds.current.add(recordedId);
      const toWrite: Event = { ...e, id: recordedId };
      createEvent(db, childId, toWrite).catch((err) => {
        // Write failed (offline, permissions, race). Remove from
        // session cache so the next render retries.
        writtenIds.current.delete(recordedId);
        console.warn("[auto-promote] persist failed", recordedId, err);
      });
    }
  }, [input.db, input.childId, input.projected, input.actuals]);
}
