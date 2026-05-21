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
 * Edit-revert (confirmed → draft) is a separate concern handled by
 * the page-level state machine in PR 3 slice B.
 */
export function useAutosaveTomorrowPlan(
  childId: string,
  date: string,
  input: TomorrowPlanInput | null,
  options: UseAutosaveTomorrowPlanOptions = {},
): void {
  const { debounceMs = 250 } = options;

  useEffect(() => {
    if (!input) return;
    const database = db as Firestore;
    // Each form-field change rebuilds `input` (it's a useMemo at the
    // call-site keyed on the form state), which retriggers this effect.
    // The cleanup clears the previous timer — net behavior is a
    // trailing-edge debounce that captures the latest input via the
    // closure. No ref needed.
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
  }, [childId, date, input, debounceMs]);
}
