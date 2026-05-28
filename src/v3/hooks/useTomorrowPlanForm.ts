"use client";

/**
 * Local form buffer for /tomorrow's plan editor.
 *
 * Owns the editable fields, one-shot hydration from the loaded plan,
 * the `hasEdits` derivation, and a `reset()`. Deliberately knows
 * nothing about Firestore — `useTomorrowPlanState` composes this with
 * the subscription, autosave, and write-path actions. Splitting the
 * buffer out keeps the subtle hydration timing (clamped to run once,
 * never clobbering a user edit with a late snapshot) in one
 * independently-testable place.
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
  /**
   * True when any field differs from the settings-derived defaults
   * baseline. Gates the Confirm button and (with `hydrated`) autosave.
   */
  hasEdits: boolean;
  /**
   * False until the first plan snapshot has been folded into the form.
   * Consumers must not autosave before this flips true, or they'd
   * persist the default values ahead of the real loaded plan.
   */
  hydrated: boolean;
  /** Reset fields to defaults and re-arm hydration (used by clear()). */
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
  // Clamps hydration to run exactly once when the snapshot first
  // resolves — avoids overwriting user edits with a late-arriving snapshot.
  const [hydrated, setHydrated] = useState(false);

  // One-shot hydration from the loaded plan. The multiple setState
  // calls are intentional: each field mirrors a different plan field so
  // subsequent user edits are independent. React-hooks linter flags
  // setState-in-effect, but hydrating async-loaded server state is the
  // canonical exception.
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
    setHydrated(false);
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
