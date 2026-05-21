"use client";

import { useEffect, useRef } from "react";
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
  // Capture latest input via ref so the timeout callback always reads
  // the most recent values without re-firing the effect on every keystroke.
  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  });

  useEffect(() => {
    if (!input) return;
    const database = db as Firestore;
    const handle = setTimeout(() => {
      const current = inputRef.current;
      if (!current) return;
      const plan: TomorrowPlan = {
        childId,
        date,
        status: "draft",
        ownerOverrides: current.ownerOverrides,
        extras: current.extras,
        ...(current.wakeTime !== undefined ? { wakeTime: current.wakeTime } : {}),
        ...(current.startTemplateId !== undefined
          ? { startTemplateId: current.startTemplateId }
          : {}),
      };
      void saveTomorrowPlan(database, childId, plan);
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [childId, date, input, debounceMs]);
}
