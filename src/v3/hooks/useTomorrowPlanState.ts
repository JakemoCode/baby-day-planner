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
 * §F12 PR 3 — central state machine for /tomorrow.
 *
 * Loads the persisted TomorrowPlan, mirrors it into form state, and
 * autosaves form changes back as `status: "draft"`. Provides actions
 * for confirm / clear / promote-now. The /tomorrow page wraps this
 * hook and renders pure UI on top.
 *
 * Edit-revert (confirmed → draft on edit) is implicit: autosave always
 * writes with `status: "draft"`, so any edit-driven save reverts a
 * previously-confirmed doc.
 */
export function useTomorrowPlanState(
  childId: string,
  date: string,
  settings: Settings,
): UseTomorrowPlanStateResult {
  const { plan, loading } = useV3TomorrowPlan(childId, date);

  // Local edit buffer: fields, one-shot hydration, hasEdits, reset.
  const form = useTomorrowPlanForm(plan, loading, settings.defaultWakeTime);
  const { wakeTime, templateId, extras, ownerOverrides, hasEdits, hydrated } = form;

  // True from the start of clear() until the delete has propagated
  // (subscription emits null). Hard-suppresses autosave for that window
  // so a clear can't be undone: after reset() the form is at defaults
  // but the stale plan still lingers (plan !== null), which would
  // otherwise pass the autosave gate and write a defaults `draft`,
  // resurrecting the doc we just deleted.
  const [clearing, setClearing] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // The delete has landed (plan gone) — clear the flag so subsequent
    // edits autosave normally again.
    if (clearing && plan === null) setClearing(false);
  }, [clearing, plan]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Autosave snapshot — null until hydrated (so we never persist the
  // defaults ahead of the loaded plan), null while a clear is in flight,
  // and null when the user hasn't touched anything AND there's no
  // pre-existing plan (no empty docs).
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
    // Write the FULL plan atomically with status=confirmed so the
    // ~250ms debounced autosave can't race + revert us back to draft.
    // (Reviewer-flagged 2026-05-21: confirmTomorrowPlan-via-updateDoc
    // only flipped status; a pending autosave then overwrote with the
    // newer form state at status=draft, silently undoing the confirm.)
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
    // Suppress autosave for the whole delete→propagate window (cleared
    // by the effect above once plan goes null), so neither the stale
    // plan nor the blanked form can resurrect the doc.
    setClearing(true);
    try {
      await deleteTomorrowPlan(db, childId, date);
    } catch (err) {
      // Delete failed → the doc still exists and `plan` never goes null,
      // so the effect would never clear the flag and autosave would stay
      // disabled for the rest of the session. Restore it here and
      // re-throw for the caller's error handling. form.reset() stays
      // below the try so the form only blanks on a real delete.
      setClearing(false);
      throw err;
    }
    // Blank the form to defaults. reset() stays hydrated, so the stale
    // snapshot can't re-hydrate the values we just deleted.
    form.reset();
  };

  const promoteNow = async () => {
    if (!plan) return;
    // The persisted plan's `date` is tomorrow's; promote-now applies
    // its content to TODAY. Clone with today's date so promoteFromPlan
    // creates/overrides today's day doc + the extras get the right
    // dayId. The persisted tomorrow-dated plan is left alone — user
    // may still want to keep it as a draft for tomorrow.
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
