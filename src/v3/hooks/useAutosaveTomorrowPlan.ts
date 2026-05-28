"use client";

import { useEffect } from "react";
import { db } from "@/lib/firebase/client";
import { saveTomorrowPlan } from "../repositories/tomorrowPlans";
import type { Event, OwnerRef, TimeMin, TomorrowPlan } from "../schemas";

/** User-editable plan fields. `childId`, `date`, and `status` are managed by the autosave hook. */
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
 * Debounced autosave of form state as a draft TomorrowPlan.
 * Skips the write when `persistedPlan` already matches input (prevents
 * a pending autosave from overwriting a confirm() or noisy hydration no-ops).
 * Pass `null` for input to suppress autosave entirely.
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
      void saveTomorrowPlan(db, childId, plan);
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [childId, date, input, persistedPlan, debounceMs]);
}

/** Content equality between input and persisted plan, ignoring `status`/`confirmedAt`. */
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
  // Reference equality is sufficient; false-negative (extra write) is harmless.
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
