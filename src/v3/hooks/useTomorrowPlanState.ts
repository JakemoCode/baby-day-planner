"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase/client";
import { promoteFromPlan } from "../repositories/days";
import { deleteTomorrowPlan, saveTomorrowPlan } from "../repositories/tomorrowPlans";
import type { Event, OwnerRef, Settings, TimeMin, TomorrowPlan } from "../schemas";
import { currentLocalDate, currentLocalMinutes } from "../ui/time";
import { useV3TomorrowPlan } from "./useV3TomorrowPlan";
import { useTomorrowPlanForm } from "./useTomorrowPlanForm";
import { useAutosaveTomorrowPlan, type TomorrowPlanInput } from "./useAutosaveTomorrowPlan";

export type TomorrowPlanStatus = "no-plan" | "draft" | "confirmed";

export type UseTomorrowPlanStateResult = {
  /** Persisted plan from Firestore, or null if no doc exists. */
  plan: TomorrowPlan | null;
  loading: boolean;
  status: TomorrowPlanStatus;
  /** Form fields (mirrored to Firestore via autosave). */
  wakeTime: TimeMin;
  templateId: string | undefined;
  extras: Event[];
  ownerOverrides: Record<string, OwnerRef | null>;
  setWakeTime: (wakeTime: TimeMin) => void;
  setTemplateId: (templateId: string | undefined) => void;
  upsertExtra: (event: Event) => void;
  removeExtra: (eventId: string) => void;
  setOwnerOverride: (eventKey: string, owner: OwnerRef | null) => void;
  /** Promote `confirmed` (or current draft) into Firestore eligibility. */
  confirm: () => Promise<void>;
  /** Delete the plan doc; reset form to settings defaults. */
  clear: () => Promise<void>;
  /** Immediately apply this plan to today's date (overrides). */
  promoteNow: () => Promise<void>;
  /**
   * True when the local form has any value different from the
   * settings-derived defaults baseline. Used to gate the Confirm
   * button (no point confirming defaults).
   */
  hasEdits: boolean;
};

/**
 * Central state machine for /tomorrow. Loads the persisted TomorrowPlan,
 * mirrors it into form state, autosaves as draft, and provides confirm/clear/promote-now actions.
 */
export function useTomorrowPlanState(
  childId: string,
  date: string,
  settings: Settings,
): UseTomorrowPlanStateResult {
  const { plan, loading } = useV3TomorrowPlan(childId, date);

  const form = useTomorrowPlanForm(plan, loading, settings.defaultWakeTime);
  const { wakeTime, templateId, extras, ownerOverrides, hasEdits, hydrated } = form;

  // Suppresses autosave from clear() until the delete propagates (plan goes null).
  // Without this, the blanked form would resurrect the deleted doc as a defaults draft.
  const [clearing, setClearing] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Delete has propagated — re-arm autosave.
    if (clearing && plan === null) setClearing(false);
  }, [clearing, plan]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // null until hydrated, while clearing, or when the form is at defaults with no existing plan.
  const autosaveInput: TomorrowPlanInput | null = useMemo(() => {
    if (!hydrated || clearing) return null;
    if (!hasEdits && plan === null) return null;
    return {
      wakeTime,
      ownerOverrides,
      extras,
      ...(templateId !== undefined ? { startTemplateId: templateId } : {}),
    };
  }, [hydrated, clearing, hasEdits, plan, wakeTime, ownerOverrides, extras, templateId]);

  useAutosaveTomorrowPlan(childId, date, autosaveInput, plan);

  const status: TomorrowPlanStatus = !plan ? "no-plan" : plan.status;

  const confirm = async () => {
    // Write the full plan with status=confirmed so a pending autosave can't race and revert it.
    // updateDoc-only confirm would be overwritten by the debounced autosave at status=draft.
    const plan: TomorrowPlan = {
      childId,
      date,
      status: "confirmed",
      confirmedAt: currentLocalMinutes(),
      ownerOverrides,
      extras,
      ...(wakeTime !== undefined ? { wakeTime } : {}),
      ...(templateId !== undefined ? { startTemplateId: templateId } : {}),
    };
    await saveTomorrowPlan(db, childId, plan);
  };

  const clear = async () => {
    // Suppress autosave until the delete propagates (see clearing flag above).
    setClearing(true);
    try {
      await deleteTomorrowPlan(db, childId, date);
    } catch (err) {
      // Delete failed: plan never goes null so the effect won't clear the flag.
      // Restore autosave and re-throw; form.reset() only runs on a real delete.
      setClearing(false);
      throw err;
    }
    // Blank form; reset() stays hydrated so a late snapshot can't re-hydrate deleted values.
    form.reset();
  };

  const promoteNow = async () => {
    if (!plan) return;
    // Clone with today's date so promoteFromPlan targets today's Day doc.
    // The tomorrow-dated plan is left in place.
    const todayPlan: TomorrowPlan = { ...plan, date: currentLocalDate() };
    await promoteFromPlan(db, childId, todayPlan, settings.defaultWakeTime);
  };

  return {
    plan,
    loading,
    status,
    wakeTime,
    templateId,
    extras,
    ownerOverrides,
    setWakeTime: form.setWakeTime,
    setTemplateId: form.setTemplateId,
    upsertExtra: form.upsertExtra,
    removeExtra: form.removeExtra,
    setOwnerOverride: form.setOwnerOverride,
    confirm,
    clear,
    promoteNow,
    hasEdits,
  };
}
