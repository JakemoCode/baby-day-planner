"use client";

/**
 * Local form buffer for /tomorrow's plan editor.
 * Owns editable fields, one-shot hydration, hasEdits, and reset().
 * Knows nothing about Firestore — composed by useTomorrowPlanState.
 */

import { useEffect, useMemo, useState } from "react";
import type { Event, OwnerRef, TimeMin, TomorrowPlan } from "../schemas";

export type UseTomorrowPlanFormResult = {
  wakeTime: TimeMin;
  templateId: string | undefined;
  extras: Event[];
  ownerOverrides: Record<string, OwnerRef | null>;
  setWakeTime: (wakeTime: TimeMin) => void;
  setTemplateId: (templateId: string | undefined) => void;
  upsertExtra: (event: Event) => void;
  removeExtra: (eventId: string) => void;
  setOwnerOverride: (eventKey: string, owner: OwnerRef | null) => void;
  /** True when any field differs from the defaults baseline. Gates Confirm and autosave. */
  hasEdits: boolean;
  /** False until the first snapshot has been folded in. Autosave must not fire before this. */
  hydrated: boolean;
  /**
   * Blank fields to defaults. Leaves `hydrated` TRUE: re-arming would
   * let the still-in-flight plan snapshot re-hydrate the deleted values
   * and autosave would resurrect the doc.
   */
  reset: () => void;
};

export function useTomorrowPlanForm(
  plan: TomorrowPlan | null,
  loading: boolean,
  defaultWakeTime: TimeMin,
): UseTomorrowPlanFormResult {
  const [wakeTime, setWakeTime] = useState<TimeMin>(defaultWakeTime);
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [extras, setExtras] = useState<Event[]>([]);
  const [ownerOverrides, setOwnerOverrides] = useState<Record<string, OwnerRef | null>>({});
  // Runs once; prevents late snapshots from overwriting user edits.
  const [hydrated, setHydrated] = useState(false);

  // One-shot hydration; multiple setState calls are intentional (each field is independent).
  // setState-in-effect is the canonical exception for async-loaded server state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (loading || hydrated) return;
    if (plan) {
      setWakeTime(plan.wakeTime ?? defaultWakeTime);
      setTemplateId(plan.startTemplateId);
      setExtras(plan.extras);
      setOwnerOverrides(plan.ownerOverrides);
    }
    setHydrated(true);
  }, [loading, hydrated, plan, defaultWakeTime]);
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
    if (wakeTime !== defaultWakeTime) return true;
    if (templateId !== undefined) return true;
    if (extras.length > 0) return true;
    if (Object.keys(ownerOverrides).length > 0) return true;
    return false;
  }, [wakeTime, templateId, extras, ownerOverrides, defaultWakeTime]);

  const reset = () => {
    setWakeTime(defaultWakeTime);
    setTemplateId(undefined);
    setExtras([]);
    setOwnerOverrides({});
    // Stay hydrated — re-arming would re-hydrate from the stale plan and autosave would resurrect the doc.
    setHydrated(true);
  };

  return {
    wakeTime,
    templateId,
    extras,
    ownerOverrides,
    setWakeTime,
    setTemplateId,
    upsertExtra,
    removeExtra,
    setOwnerOverride,
    hasEdits,
    hydrated,
    reset,
  };
}
