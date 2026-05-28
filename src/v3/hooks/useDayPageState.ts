"use client";

/**
 * Composite hook bundling the active-day data wiring used by both the
 * dashboard and timeline pages. Pre-extraction, the two pages
 * duplicated the same useV3Day + useV3Settings + useV3Events +
 * useV3Templates + useV3Projection + useDrawer + useDayDrawerSuppressions
 * block verbatim. Anything that's truly per-page (auto-promote
 * persistence, reconcileActiveDay, the wake-confirm sheet) stays in
 * the page so this hook keeps its single responsibility: "give me
 * everything I need to render today's day."
 */

import { useMemo } from "react";
import type { Firestore } from "firebase/firestore";
import type { Event, OwnershipTemplate } from "../schemas";
import { useV3Day } from "./useV3Day";
import { useV3Settings } from "./useV3Settings";
import { useV3Events } from "./useV3Events";
import { useV3Templates } from "./useV3Templates";
import { useV3Projection } from "./useV3Projection";
import { useDrawer, type DrawerState } from "./useDrawer";
import { useDayDrawerSuppressions } from "./useDayDrawerSuppressions";
import { updateDayOwnerOverride } from "../repositories/days";
import type { Day, Settings } from "../schemas";

export type UseDayPageStateResult = {
  day: Day | null;
  dayLoading: boolean;
  settings: Settings | null;
  settingsLoading: boolean;
  actuals: Event[];
  saveEvent: (event: Event) => Promise<void>;
  deleteOptimistic: (eventId: string) => Promise<void>;
  template: OwnershipTemplate | undefined;
  projected: Event[];
  drawer: DrawerState;
  openCreate: ReturnType<typeof useDrawer>["openCreate"];
  openEdit: ReturnType<typeof useDrawer>["openEdit"];
  close: ReturnType<typeof useDrawer>["close"];
  onSave: ReturnType<typeof useDrawer>["onSave"];
  onDelete: ReturnType<typeof useDrawer>["onDelete"];
};

export function useDayPageState(db: Firestore, childId: string): UseDayPageStateResult {
  const { day, loading: dayLoading } = useV3Day(childId);
  const { settings, loading: settingsLoading } = useV3Settings(childId);
  const { events: actuals, saveEvent, deleteOptimistic } = useV3Events(childId, day?.id ?? "");
  const { templates } = useV3Templates(childId);
  const drawerSuppressions = useDayDrawerSuppressions(db, childId, day?.id);

  const { drawer, openCreate, openEdit, close, onSave, onDelete } = useDrawer(
    actuals,
    saveEvent,
    deleteOptimistic,
    day?.id
      ? (eventKey, owner) => updateDayOwnerOverride(db, childId, day.id, eventKey, owner)
      : undefined,
    drawerSuppressions,
  );

  const template = useMemo<OwnershipTemplate | undefined>(() => {
    if (!day?.templateId) return undefined;
    return templates.find((t) => t.id === day.templateId);
  }, [day, templates]);

  const projected = useV3Projection({
    day,
    settings,
    actuals,
    ...(template ? { template } : {}),
  });

  return {
    day,
    dayLoading,
    settings,
    settingsLoading,
    actuals,
    saveEvent,
    deleteOptimistic,
    template,
    projected,
    drawer,
    openCreate,
    openEdit,
    close,
    onSave,
    onDelete,
  };
}
