"use client";

/**
 * Composite hook for active-day data wiring shared by dashboard and timeline.
 * Per-page concerns (auto-promote, wake-confirm) stay in each page.
 */

import { useCallback, useMemo } from "react";
import type { Firestore } from "firebase/firestore";
import type { Day, Event, OwnershipTemplate, Settings } from "../schemas";
import { useV3Day } from "./useV3Day";
import { useV3Settings } from "./useV3Settings";
import { useV3Events } from "./useV3Events";
import { useV3Templates } from "./useV3Templates";
import { useV3Projection } from "./useV3Projection";
import { useDrawer, type DrawerState, type UseDrawerResult } from "./useDrawer";
import { useDayDrawerSuppressions } from "./useDayDrawerSuppressions";
import { useReconcileActiveDay } from "./useReconcileActiveDay";
import { useCurrentLocalDate } from "./useCurrentLocalDate";
import { updateDayOwnerOverride } from "../repositories/days";
import { createEventOnCalendarDay } from "../repositories/eventRouting";
import { currentLocalDate } from "../ui/time";

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
  openCreate: UseDrawerResult["openCreate"];
  openEdit: UseDrawerResult["openEdit"];
  close: UseDrawerResult["close"];
  onSave: UseDrawerResult["onSave"];
  onDelete: UseDrawerResult["onDelete"];
};

export function useDayPageState(db: Firestore, childId: string): UseDayPageStateResult {
  const { day, loading: dayLoading } = useV3Day(childId);
  const { settings, loading: settingsLoading } = useV3Settings(childId);

  // Roll the active day over to today on both dashboard AND timeline (this hook is
  // shared by both). `today` is reactive — it advances at midnight and on app focus —
  // so a view left open overnight auto-advances instead of staying pinned to a stale
  // active day (which mixed yesterday's recorded events with today's fresh ones). §F68.
  const today = useCurrentLocalDate();
  useReconcileActiveDay(childId, today, settings?.defaultWakeTime ?? 7 * 60);
  const { events: actuals, saveEvent, deleteOptimistic } = useV3Events(childId, day?.id ?? "");
  const { templates } = useV3Templates(childId);
  const drawerSuppressions = useDayDrawerSuppressions(db, childId, day?.id);

  // DOMAIN §2 midnight rule: a brand-new event created while the app is still
  // showing yesterday's active day (post-midnight, pre-rollover) must land on
  // today's calendar day, not the stale active day. Edits keep their own day.
  const saveNewEvent = useCallback(
    async (event: Event) => {
      const nowDate = currentLocalDate();
      if (!day || !settings || nowDate === day.date) {
        await saveEvent(event);
        return;
      }
      await createEventOnCalendarDay(db, childId, event, nowDate, settings.defaultWakeTime);
    },
    [db, childId, day, settings, saveEvent],
  );

  const { drawer, openCreate, openEdit, close, onSave, onDelete } = useDrawer({
    saveEvent,
    deleteOptimistic,
    ...(day?.id
      ? {
          setOwnerOverride: (eventKey, owner) =>
            updateDayOwnerOverride(db, childId, day.id, eventKey, owner),
        }
      : {}),
    suppressions: drawerSuppressions,
    saveNewEvent,
  });

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
