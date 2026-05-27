"use client";

import { useEffect, useMemo, useState } from "react";
import type { Event, OwnershipTemplate, TimeMin } from "@/v3/schemas";
import { reduceLifecycle } from "@/v3/lifecycle";
import { isInProgress } from "@/v3/lib/effectiveEnd";
import {
  currentWakeWindow,
  nearestBottleInWindow,
  nextNap,
  projectedBedtime,
} from "@/v3/selectors";
import { LOG_BOTTLE_WINDOW_MIN } from "@/v3/components/Dashboard/decideMode";
import { nextDashboardEvent } from "@/v3/components/Dashboard/dashboardStats";
import { useNowMinutes } from "@/hooks/useNowMinutes";
import { useV3Day } from "@/v3/hooks/useV3Day";
import { useV3Events } from "@/v3/hooks/useV3Events";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { useV3Templates } from "@/v3/hooks/useV3Templates";
import { useV3Projection } from "@/v3/hooks/useV3Projection";
import { useV3TomorrowPlan } from "@/v3/hooks/useV3TomorrowPlan";
import { useReconcileActiveDay } from "@/v3/hooks/useReconcileActiveDay";
import { useDrawer } from "@/v3/hooks/useDrawer";
import {
  getOrCreatePlannedDay,
  promoteFromPlan,
  startNewDay,
  updateDayOwnerOverride,
} from "@/v3/repositories/days";
import {
  createEvent,
  deleteEvent,
  listEvents,
  reconcileDuplicateEventDocs,
} from "@/v3/repositories/events";
import { db } from "@/lib/firebase/client";
import { DashboardSkeleton } from "@/v3/components/Dashboard/DashboardSkeleton";
import { FAB } from "@/components/shared/FAB";
import { FABTypePicker } from "@/components/shared/FABTypePicker";
import type { CreatableType } from "@/v3/components/shared/createEventTemplate";
import { buildCreateTemplate } from "@/v3/components/shared/createEventTemplate";
import { EventEditDrawerV3 } from "@/v3/components/shared/EventEditDrawerV3";
import { NowBanner } from "@/v3/components/Dashboard/NowBanner";
import { ContextualActionButton } from "@/v3/components/Dashboard/ContextualActionButton";
import { NextBottlePanel } from "@/v3/components/Dashboard/NextBottlePanel";
import { NextEventCard } from "@/v3/components/Dashboard/NextEventCard";
import { NextSleepPanel } from "@/v3/components/Dashboard/NextSleepPanel";
import { StartDayButton } from "@/v3/components/Dashboard/StartDayButton";
import { WakeConfirmSheet } from "@/v3/components/Dashboard/WakeConfirmSheet";
import styles from "./page.module.css";
import { useCurrentChild } from "@/v3/context/ChildProvider";

function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DashboardPage() {
  const CHILD_ID = useCurrentChild().id;
  const nowMinutes = useNowMinutes();
  const { day, loading: dayLoading } = useV3Day(CHILD_ID);
  const { settings, loading: settingsLoading } = useV3Settings(CHILD_ID);
  const { events: actuals, saveEvent, deleteOptimistic } = useV3Events(CHILD_ID, day?.id ?? "");
  const { templates } = useV3Templates(CHILD_ID);
  // §F17 — auto-reconcile the active day on every dashboard mount.
  // Side-effect only; the new active day flows back through useV3Day's
  // subscription. Defaults to settings.defaultWakeTime if no confirmed
  // plan exists for today.
  useReconcileActiveDay(CHILD_ID, todayDate(), settings?.defaultWakeTime ?? 7 * 60);
  // §F59 — one-shot orphan cleanup per day load. Pre-§F59 inconsistent
  // write-path id conventions could leave two Firestore docs sharing
  // `(type, eventKey)` (one `nap_N`, one `recorded_nap_N`). Deletes the
  // loser (most-recent annotation wins). Idempotent — no-op once clean.
  useEffect(() => {
    if (!day?.id) return;
    void reconcileDuplicateEventDocs(db, CHILD_ID, day.id);
  }, [CHILD_ID, day?.id]);
  // §F12 — surface today's plan to the dev StartDayButton so it can
  // re-promote from the plan vs defaults during dogfood iteration.
  const { plan: todaysPlan } = useV3TomorrowPlan(CHILD_ID, todayDate());
  const hasTomorrowPlan = todaysPlan?.status === "confirmed";
  const { drawer, openCreate, close, onSave, onDelete } = useDrawer(
    actuals,
    saveEvent,
    deleteOptimistic,
    day?.id
      ? (eventKey, owner) => updateDayOwnerOverride(db, CHILD_ID, day.id, eventKey, owner)
      : undefined,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wakeSheetOpen, setWakeSheetOpen] = useState(false);

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

  // Loading + just-mounted + post-onboarding all collapse to the same
  // skeleton. The previous code flashed a "Start first day" CTA between
  // (a) the active-day subscription emitting loading=false and (b) the
  // day data actually arriving — looked like the dashboard was empty/
  // broken for ~500ms post-onboarding. useReconcileActiveDay will write
  // a Day if none exists, so we can always trust that one is coming;
  // skeleton until then.
  //
  // Wake gate: explicit undefined check — `wakeTime: 0` is technically
  // valid (midnight) and must NOT be treated as "no day yet". Settings
  // is guaranteed present post-§F3 onboarding (layout redirects to
  // /welcome otherwise), so `!settings` collapses to a defensive load
  // state rather than a first-time-bootstrap branch.
  if (dayLoading || settingsLoading || !settings || !day || day.wakeTime === undefined) {
    return <DashboardSkeleton />;
  }

  const next = nextDashboardEvent(projected, nowMinutes);

  // Symmetric ±15min window around the nearest projected bottle slot —
  // the contextual button's Log Bottle Time mode shows BOTH before and
  // after the projected time (engine auto-promote flips lifecycle when
  // Now crosses startTime, but the user can still confirm with a real
  // log up to LOG_BOTTLE_WINDOW_MIN after).
  const nb = nearestBottleInWindow(projected, nowMinutes, LOG_BOTTLE_WINDOW_MIN);
  const nn = nextNap(projected, nowMinutes);
  const cww = currentWakeWindow(projected, nowMinutes);
  // Source from `projected` (not `actuals`) so engine-side Now-cross
  // auto-promote (ADR-0001) surfaces in-progress naps even when the
  // user hasn't written a Firestore record yet. A projected nap whose
  // startTime <= Now is flipped to `recorded` by the evaluator; that
  // recording lives in `projected` only, not `actuals`. Without this,
  // tapping a chip mid-nap wouldn't surface End Nap because the
  // dashboard only saw Firestore-persisted events.
  const inProgressNap = projected.find(
    (e) => e.type === "nap" && isInProgress(e, settings, nowMinutes),
  );
  // Bedtime in-progress detection is intentionally NOT time-windowed.
  // `isInProgress` requires `startTime <= now`, but a bedtime that began
  // at 8 PM yesterday-frame (startTime=1200) and is being checked at
  // 6:42 AM next morning (nowMinutes=402) would fail that check even
  // though it's the exact state where the user needs "End overnight
  // sleep" / wake-up. A recorded bedtime stays in-progress until the
  // user explicitly ends it (TIME_EDIT → completed) or wakes the new
  // day via the wake CTA.
  const inProgressBedtime = actuals.find(
    (e) => e.type === "bedtime" && e.lifecycle.state === "recorded",
  );
  const bedtime = projectedBedtime(projected);

  const handleLogBottle = async (bottle: Event) => {
    // §F22 / midnight rule (DOMAIN.md §2): a bottle recorded at 2 AM
    // belongs to today's *calendar* day, not the currently-active day
    // doc (which is yesterday's planning day until the user starts the
    // new one). If the wall-clock date differs from the active day's
    // date, lazy-create a `planned` doc for that date and write there.
    const bottleDate = todayDate();
    if (bottleDate !== day.date) {
      const target = await getOrCreatePlannedDay(
        db,
        CHILD_ID,
        bottleDate,
        settings.defaultWakeTime,
      );
      await createEvent(db, CHILD_ID, { ...bottle, dayId: target.id });
      return;
    }
    await saveEvent(bottle);
  };
  // TIME_EDIT on a recorded nap → completed. The event may be either
  // a Firestore-persisted actual (id stable) or an engine projection
  // that auto-promoted to recorded (id synthetic, e.g. proj_nap_t540).
  // §F59 deterministic id: rewrite to `recorded_${eventKey}` so the
  // first commit and any subsequent drawer edits overwrite the same
  // doc rather than leaving an orphan with a `proj_*` id.
  const handleEndNap = async (event: Event, endTime: number) => {
    if (!day || day.id === "") return;
    await saveEvent({
      ...event,
      id: `recorded_${event.eventKey}`,
      endTime,
      lifecycle: reduceLifecycle(event.lifecycle, { type: "TIME_EDIT", at: endTime }),
    });
  };
  // "End overnight sleep" = morning wake-up. Opens the confirm sheet
  // (handler on the JSX), Confirm fires startNewDay — which atomically
  // archives the active day, trims yesterday's bedtime endTime, and
  // creates the new day. The bedtime trim is startNewDay's job; this
  // handler doesn't TIME_EDIT the bedtime directly.
  const handleConfirmWake = async (wakeTime: TimeMin) => {
    setWakeSheetOpen(false);
    await startNewDay(db, CHILD_ID, {
      newDayId: `day-${Date.now()}`,
      newDate: todayDate(),
      newWakeTime: wakeTime,
      ...(day.templateId ? { templateId: day.templateId } : {}),
    });
  };
  const handleStartDay = async ({ useTomorrowPlan }: { useTomorrowPlan: boolean }) => {
    // Dev StartDayButton re-promote: archive today and re-create either
    // from the confirmed plan (matches the auto-rollover path) or from
    // settings defaults. Both paths use the deterministic id so the
    // re-write replaces today's existing doc idempotently.
    //
    // §F66 fast-follow: same-date Start New Day collides on the
    // deterministic dayId (`day-${childId}-${date}`), so the events
    // subcollection under that id keeps yesterday's writes. For the
    // dev rollover we explicitly delete all events under the active
    // day's id BEFORE the day-doc replace — gives the user a true
    // blank canvas. Production auto-rollover (different date) doesn't
    // hit this path; this is dev-only.
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
        {...(cww ? { wakeWindow: cww } : {})}
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
        nextBottle={nb}
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

      <div className={styles.actions}>
        <ContextualActionButton
          inProgressNap={inProgressNap}
          inProgressBedtime={inProgressBedtime}
          nextProjectedBottle={nb}
          dayId={day.id}
          defaultBottleAmountOz={settings.defaultBottleAmountOz}
          nowMinutes={nowMinutes}
          onEndNap={handleEndNap}
          onWakeRequest={() => setWakeSheetOpen(true)}
          onLogBottle={handleLogBottle}
        />
        {process.env.NODE_ENV === "development" && (
          <div className={styles.actionsRow}>
            <StartDayButton hasTomorrowPlan={hasTomorrowPlan} onStart={handleStartDay} />
          </div>
        )}
      </div>

      <FAB label="Add an event" onClick={() => setPickerOpen(true)} />

      <FABTypePicker
        open={pickerOpen}
        onSelect={(type: CreatableType) => {
          setPickerOpen(false);
          const tpl = buildCreateTemplate({
            type,
            dayId: day.id,
            actuals,
            settings,
            nowMinutes,
            projected,
          });
          openCreate(tpl);
        }}
        onCancel={() => setPickerOpen(false)}
      />

      <EventEditDrawerV3
        key={
          drawer.open && drawer.mode === "edit"
            ? drawer.event.id
            : drawer.open && drawer.mode === "create"
              ? drawer.template.id
              : "closed"
        }
        owners={settings.owners}
        nowMinutes={nowMinutes}
        bedtimeThreshold={settings.bedtimeThreshold}
        defaultWakeTime={settings.defaultWakeTime}
        existingEvents={projected}
        open={drawer.open}
        event={drawer.open ? (drawer.mode === "edit" ? drawer.event : drawer.template) : null}
        mode={drawer.open && drawer.mode === "edit" ? "edit" : "create"}
        onSave={onSave}
        onDelete={onDelete}
        onCancel={close}
      />

      {/* Conditionally mount so each open creates a fresh component
          with a fresh `useState(formatHM24(nowMinutes))` initial value.
          Unconditional mount would snapshot `nowMinutes` at dashboard
          mount; by morning the prefill would be stale. */}
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
