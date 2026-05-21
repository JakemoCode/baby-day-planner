"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase/client";
import type { Firestore } from "firebase/firestore";
import { promoteFromPlan } from "../repositories/days";
import { confirmTomorrowPlan, deleteTomorrowPlan } from "../repositories/tomorrowPlans";
import type { Event, OwnerRef, Settings, TimeMin, TomorrowPlan } from "../schemas";
import { currentLocalDate, currentLocalMinutes } from "../ui/time";
import { useV3TomorrowPlan } from "./useV3TomorrowPlan";
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

  // Local form state. Hydrates from the loaded plan when one exists,
  // or from settings defaults when not.
  const [wakeTime, setWakeTime] = useState<TimeMin>(settings.defaultWakeTime);
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [extras, setExtras] = useState<Event[]>([]);
  const [ownerOverrides, setOwnerOverrides] = useState<Record<string, OwnerRef | null>>({});
  // Tracks whether we've hydrated from the loaded plan yet — avoids
  // overwriting user edits with the late-arriving snapshot.
  const [hydrated, setHydrated] = useState(false);

  // One-shot hydration from the loaded plan — runs exactly once when
  // the snapshot first resolves (the `hydrated` flag clamps it). The
  // multiple setState calls here are intentional: each form field
  // mirrors a different plan field so subsequent user edits are
  // independent. React-hooks linter flags setState-in-effect but
  // hydration of async-loaded server state is the canonical exception.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (loading || hydrated) return;
    if (plan) {
      setWakeTime(plan.wakeTime ?? settings.defaultWakeTime);
      setTemplateId(plan.startTemplateId);
      setExtras(plan.extras);
      setOwnerOverrides(plan.ownerOverrides);
    }
    setHydrated(true);
  }, [loading, hydrated, plan, settings.defaultWakeTime]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const upsertExtra = (event: Event) => {
    setExtras((prev) => {
      if (prev.some((e) => e.id === event.id)) {
        return prev.map((e) => (e.id === event.id ? event : e));
      }
      return [...prev, event];
    });
  };

  const removeExtra = (eventId: string) => {
    setExtras((prev) => prev.filter((e) => e.id !== eventId));
  };

  const setOwnerOverride = (eventKey: string, owner: OwnerRef | null) => {
    setOwnerOverrides((prev) => ({ ...prev, [eventKey]: owner }));
  };

  const hasEdits = useMemo(() => {
    if (wakeTime !== settings.defaultWakeTime) return true;
    if (templateId !== undefined) return true;
    if (extras.length > 0) return true;
    if (Object.keys(ownerOverrides).length > 0) return true;
    return false;
  }, [wakeTime, templateId, extras, ownerOverrides, settings.defaultWakeTime]);

  // Autosave snapshot — null when the user hasn't touched anything yet
  // AND there's no pre-existing plan, so we don't materialize empty docs.
  const autosaveInput: TomorrowPlanInput | null = useMemo(() => {
    if (!hydrated) return null;
    if (!hasEdits && plan === null) return null;
    return {
      wakeTime,
      ownerOverrides,
      extras,
      ...(templateId !== undefined ? { startTemplateId: templateId } : {}),
    };
  }, [hydrated, hasEdits, plan, wakeTime, ownerOverrides, extras, templateId]);

  useAutosaveTomorrowPlan(childId, date, autosaveInput);

  const status: TomorrowPlanStatus = !plan ? "no-plan" : plan.status;

  const confirm = async () => {
    await confirmTomorrowPlan(db as Firestore, childId, date, currentLocalMinutes());
  };

  const clear = async () => {
    await deleteTomorrowPlan(db as Firestore, childId, date);
    setWakeTime(settings.defaultWakeTime);
    setTemplateId(undefined);
    setExtras([]);
    setOwnerOverrides({});
    // Reset hydration so any future loaded plan re-hydrates cleanly.
    setHydrated(false);
  };

  const promoteNow = async () => {
    if (!plan) return;
    // The persisted plan's `date` is tomorrow's; promote-now applies
    // its content to TODAY. Clone with today's date so promoteFromPlan
    // creates/overrides today's day doc + the extras get the right
    // dayId. The persisted tomorrow-dated plan is left alone — user
    // may still want to keep it as a draft for tomorrow.
    const todayPlan: TomorrowPlan = { ...plan, date: currentLocalDate() };
    await promoteFromPlan(db as Firestore, childId, todayPlan, settings.defaultWakeTime);
  };

  return {
    plan,
    loading,
    status,
    wakeTime,
    templateId,
    extras,
    ownerOverrides,
    setWakeTime,
    setTemplateId,
    upsertExtra,
    removeExtra,
    setOwnerOverride,
    confirm,
    clear,
    promoteNow,
    hasEdits,
  };
}
