"use client";

import { useEffect, useState } from "react";
import type { Event, TimeMin } from "@/v3/schemas";
import { reduceLifecycle } from "@/v3/lifecycle";
import { isInProgress } from "@/v3/lib/effectiveEnd";
import { isRenderSynthetic } from "@/v3/lib/syntheticEvents";
import { nextBottle, nextNap, projectedBedtime } from "@/v3/selectors";
import { nextDashboardEvent, pumpTotalOz } from "@/v3/components/Dashboard/dashboardStats";
import { useNowMinutes } from "@/hooks/useNowMinutes";
import { useV3TomorrowPlan } from "@/v3/hooks/useV3TomorrowPlan";
import { useDayPageState } from "@/v3/hooks/useDayPageState";
import { isEngineEmittedId, recordedIdFor } from "@/v3/lib/eventConventions";
import { promoteFromPlan, startNewDay } from "@/v3/repositories/days";
import { forecastSnapshotDocs } from "@/v3/lib/forecastSnapshot";
import { deleteEvent, listEvents, reconcileDuplicateEventDocs } from "@/v3/repositories/events";
import { db } from "@/lib/firebase/client";
import { DashboardSkeleton } from "@/v3/components/Dashboard/DashboardSkeleton";
import { DrawerShell } from "@/v3/components/shared/DrawerShell";
import { NowBanner } from "@/v3/components/Dashboard/NowBanner";
import { ContextualActionButton } from "@/v3/components/Dashboard/ContextualActionButton";
import { NextBottlePanel } from "@/v3/components/Dashboard/NextBottlePanel";
import { NextEventCard } from "@/v3/components/Dashboard/NextEventCard";
import { NextSleepPanel } from "@/v3/components/Dashboard/NextSleepPanel";
import { PumpVolumeCard } from "@/v3/components/Dashboard/PumpVolumeCard";
import { StartDayButton } from "@/v3/components/Dashboard/StartDayButton";
import { WakeConfirmSheet } from "@/v3/components/Dashboard/WakeConfirmSheet";
import styles from "./page.module.css";
import { useCurrentChild } from "@/v3/context/ChildProvider";
import { currentLocalDate as todayDate } from "@/v3/ui/time";

export default function DashboardPage() {
  const CHILD_ID = useCurrentChild().id;
  const nowMinutes = useNowMinutes();
  const {
    day,
    dayLoading,
    settings,
    settingsLoading,
    actuals,
    saveEvent,
    projected,
    drawer,
    close,
    onSave,
    onDelete,
  } = useDayPageState(db, CHILD_ID);
  // Day reconcile now lives in useDayPageState (shared by dashboard + timeline).
  // One-shot orphan cleanup: removes duplicate Firestore event docs sharing (type, eventKey). Idempotent.
  useEffect(() => {
    if (!day?.id) return;
    void reconcileDuplicateEventDocs(db, CHILD_ID, day.id);
  }, [CHILD_ID, day?.id]);
  // Supplies the dev StartDayButton with today's confirmed plan for re-promotion.
  const { plan: todaysPlan } = useV3TomorrowPlan(CHILD_ID, todayDate());
  const hasTomorrowPlan = todaysPlan?.status === "confirmed";
  const [wakeSheetOpen, setWakeSheetOpen] = useState(false);

  // §F66: projections are EPHEMERAL — never persisted on view. The full-day cascade
  // keeps morning forecasts alive without persistence (so the old auto-promote hook is
  // gone), which kills the zombie + the nav-to-nav flicker at the root. History is
  // frozen at day-close via the archival snapshot, not by writing on every render.

  // Show skeleton until day+settings arrive. `wakeTime === undefined` is the gate
  // (not `!wakeTime`) because wakeTime:0 is valid (midnight).
  if (dayLoading || settingsLoading || !settings || !day || day.wakeTime === undefined) {
    return <DashboardSkeleton />;
  }

  const next = nextDashboardEvent(projected, nowMinutes);

  // §F67: the panel announces the next upcoming bottle (any distance out).
  const upcomingBottle = nextBottle(projected, nowMinutes);
  const nn = nextNap(projected, nowMinutes);
  // Use `projected` (not `actuals`) to surface engine-auto-promoted in-progress naps.
  // Filter out render-synthetic putdown chips — they inherit the parent's lifecycle
  // and would falsely trigger "End nap" before the real nap starts.
  const inProgressNap = projected.find(
    (e) => e.type === "nap" && !isRenderSynthetic(e) && isInProgress(e, settings, nowMinutes),
  );
  // Bedtime in-progress is lifecycle-based, not time-windowed — a recorded bedtime
  // that started at 8 PM appears "in-progress" next morning until the wake CTA fires.
  const inProgressBedtime = actuals.find(
    (e) => e.type === "bedtime" && e.lifecycle.state === "recorded",
  );
  const bedtime = projectedBedtime(projected);

  // Only rewrite to the deterministic id when the source is an engine projection —
  // never overwrite an actual's original doc id (would orphan legacy docs).
  const handleEndNap = async (event: Event, endTime: number) => {
    if (!day || day.id === "") return;
    const id = isEngineEmittedId(event.id) ? recordedIdFor(event.eventKey) : event.id;
    await saveEvent({
      ...event,
      id,
      endTime,
      lifecycle: reduceLifecycle(event.lifecycle, { type: "TIME_EDIT", at: endTime }),
    });
  };
  // Confirms morning wake-up; startNewDay archives the active day and trims yesterday's bedtime.
  const handleConfirmWake = async (wakeTime: TimeMin) => {
    setWakeSheetOpen(false);
    await startNewDay(db, CHILD_ID, {
      newDayId: `day-${Date.now()}`,
      newDate: todayDate(),
      newWakeTime: wakeTime,
      ...(day.templateId ? { templateId: day.templateId } : {}),
      // §F66 Slice 4: freeze the closing day's forecast bottles into history
      // (projections are ephemeral, so this is the one moment we persist them).
      freezeForecast: forecastSnapshotDocs(projected, day.id),
    });
  };
  const handleStartDay = async ({ useTomorrowPlan }: { useTomorrowPlan: boolean }) => {
    // Dev-only: delete all events before replacing the day doc to avoid subcollection collision
    // on the deterministic dayId when rolling over on the same calendar date.
    if (day?.id) {
      const existing = await listEvents(db, CHILD_ID, day.id);
      await Promise.all(existing.map((e) => deleteEvent(db, CHILD_ID, day.id, e.id)));
    }
    if (useTomorrowPlan && todaysPlan?.status === "confirmed") {
      await promoteFromPlan(db, CHILD_ID, todaysPlan, settings.defaultWakeTime);
      return;
    }
    await startNewDay(db, CHILD_ID, {
      newDate: todayDate(),
      newWakeTime: settings.defaultWakeTime,
    });
  };

  return (
    <div className={styles.page}>
      <NowBanner
        {...(inProgressNap ? { inProgressNap } : {})}
        {...(inProgressBedtime ? { inProgressBedtime } : {})}
        owners={settings.owners}
        nowMinutes={nowMinutes}
      />
      <NextEventCard
        event={next}
        nowMinutes={nowMinutes}
        owners={settings.owners}
        putdownLeadMinutes={settings.putdownLeadMinutes}
      />
      <NextBottlePanel
        nextBottle={upcomingBottle}
        actuals={actuals}
        nowMinutes={nowMinutes}
        owners={settings.owners}
      />
      <NextSleepPanel
        nextNap={nn}
        bedtime={bedtime}
        actuals={actuals}
        nowMinutes={nowMinutes}
        putdownLeadMinutes={settings.putdownLeadMinutes}
        owners={settings.owners}
      />

      {/* `projected` (not `actuals`) so scheduled pumps from pumpTimes (R9.1) show the
          card before any volume is recorded; recorded pumps carry the volume that sums. */}
      {projected.some((e) => e.type === "pump") && (
        <PumpVolumeCard totalOz={pumpTotalOz(projected)} />
      )}

      <div className={styles.actions}>
        <ContextualActionButton
          inProgressNap={inProgressNap}
          inProgressBedtime={inProgressBedtime}
          onEndNap={handleEndNap}
          onWakeRequest={() => setWakeSheetOpen(true)}
        />
        {process.env.NODE_ENV === "development" && (
          <div className={styles.actionsRow}>
            <StartDayButton hasTomorrowPlan={hasTomorrowPlan} onStart={handleStartDay} />
          </div>
        )}
      </div>

      <DrawerShell
        drawer={drawer}
        settings={settings}
        day={day}
        nowMinutes={nowMinutes}
        projected={projected}
        onSave={onSave}
        onDelete={onDelete}
        onCancel={close}
      />

      {/* Conditional mount ensures each open gets a fresh nowMinutes initial value. */}
      {wakeSheetOpen && (
        <WakeConfirmSheet
          nowMinutes={nowMinutes}
          onConfirm={handleConfirmWake}
          onCancel={() => setWakeSheetOpen(false)}
        />
      )}
    </div>
  );
}
