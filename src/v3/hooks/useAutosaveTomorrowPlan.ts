"use client";

import { useEffect } from "react";
import { db } from "@/lib/firebase/client";
import type { Firestore } from "firebase/firestore";
import { saveTomorrowPlan } from "../repositories/tomorrowPlans";
import type { Event, OwnerRef, TimeMin, TomorrowPlan } from "../schemas";

/**
 * The user-driven content of a TomorrowPlan — the parts the form
 * surface owns. `childId`, `date`, and `status` are managed by the
 * autosave hook itself.
 */
export type TomorrowPlanInput = {
  wakeTime?: TimeMin;
  startTemplateId?: string;
  ownerOverrides: Record<string, OwnerRef | null>;
  extras: Event[];
};

export type UseAutosaveTomorrowPlanOptions = {
  /** Debounce delay in ms. Default 250. */
  debounceMs?: number;
};

/**
 * §F12 PR 3 — autosave whatever the user has entered on /tomorrow as
 * a draft TomorrowPlan. Persists `status: "draft"` on every change
 * after a debounce. Caller passes `null` for "no input yet" so the
 * hook doesn't write the initial render's default form state.
 *
 * If `persistedPlan` is provided AND its content matches the current
 * input exactly, the autosave skips the write. This prevents two
 * races flagged by reviewer on 2026-05-21:
 *   - confirm() → setDoc(status: "confirmed") → debounced autosave
 *     fires later and overwrites with status: "draft", silently
 *     undoing the confirmation
 *   - hydration → form mirrors plan → autosave fires identical
 *     content as a noisy no-op write
 * Edit-revert (confirmed → draft on edit) survives because content
 * differs when the user has actually edited something.
 */
export function useAutosaveTomorrowPlan(
  childId: string,
  date: string,
  input: TomorrowPlanInput | null,
  persistedPlan: TomorrowPlan | null,
  options: UseAutosaveTomorrowPlanOptions = {},
): void {
  const { debounceMs = 250 } = options;

  useEffect(() => {
    if (!input) return;
    if (persistedPlan && inputMatchesPlan(input, persistedPlan)) return;
    const database = db as Firestore;
    const handle = setTimeout(() => {
      const plan: TomorrowPlan = {
        childId,
        date,
        status: "draft",
        ownerOverrides: input.ownerOverrides,
        extras: input.extras,
        ...(input.wakeTime !== undefined ? { wakeTime: input.wakeTime } : {}),
        ...(input.startTemplateId !== undefined ? { startTemplateId: input.startTemplateId } : {}),
      };
      void saveTomorrowPlan(database, childId, plan);
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [childId, date, input, persistedPlan, debounceMs]);
}

/**
 * Content-equality between a TomorrowPlanInput and a persisted plan.
 * Ignores `status` and `confirmedAt` (autosave never touches those
 * meaningfully — confirm/clear actions own them). Returns true when
 * the persisted plan already reflects everything in the input, so the
 * autosave can safely skip the write.
 */
function inputMatchesPlan(input: TomorrowPlanInput, plan: TomorrowPlan): boolean {
  if (plan.wakeTime !== input.wakeTime) return false;
  if (plan.startTemplateId !== input.startTemplateId) return false;
  if (!shallowEqualOwnerMap(plan.ownerOverrides, input.ownerOverrides)) return false;
  if (!shallowEqualExtras(plan.extras, input.extras)) return false;
  return true;
}

function shallowEqualOwnerMap(
  a: Record<string, OwnerRef | null>,
  b: Record<string, OwnerRef | null>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    const av = a[k];
    const bv = b[k];
    if (av === null || bv === null) {
      if (av !== bv) return false;
      continue;
    }
    if (av === undefined || bv === undefined) return false;
    if (av.slot !== bv.slot) return false;
    if (av.slot === "other" && bv.slot === "other" && av.otherId !== bv.otherId) return false;
  }
  return true;
}

function shallowEqualExtras(a: Event[], b: Event[]): boolean {
  if (a.length !== b.length) return false;
  // Extras are user-edited via the drawer; reference equality is
  // sufficient for stable values and the failure mode of false-
  // negative (writes when we don't need to) is harmless.
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
