"use client";

import { useMemo, useState } from "react";
import type { Event, OwnershipTemplate, TimeMin } from "@/v3/schemas";
import { isRecorded } from "@/v3/schemas";
import { reduceLifecycle } from "@/v3/lifecycle";
import { isInProgress } from "@/v3/lib/effectiveEnd";
import { currentWakeWindow, nextBottle, nextNap, projectedBedtime } from "@/v3/selectors";
import { nextDashboardEvent } from "@/v3/components/Dashboard/dashboardStats";
import { useNowMinutes } from "@/hooks/useNowMinutes";
import { useV3Day } from "@/v3/hooks/useV3Day";
import { useV3Events } from "@/v3/hooks/useV3Events";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { useV3Templates } from "@/v3/hooks/useV3Templates";
import { useV3Projection } from "@/v3/hooks/useV3Projection";
import { useDrawer } from "@/v3/hooks/useDrawer";
import { getOrCreatePlannedDay, startNewDay } from "@/v3/repositories/days";
import { createEvent } from "@/v3/repositories/events";
import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import { FAB } from "@/components/shared/FAB";
import { FABTypePicker } from "@/components/shared/FABTypePicker";
import type { CreatableType } from "@/v3/components/shared/createEventTemplate";
import { buildCreateTemplate } from "@/v3/components/shared/createEventTemplate";
import { EventEditDrawerV3 } from "@/v3/components/shared/EventEditDrawerV3";
import { NowBanner } from "@/v3/components/Dashboard/NowBanner";
import { ActionButton } from "@/v3/components/Dashboard/ActionButton";
import { NapActionButton } from "@/v3/components/Dashboard/NapActionButton";
import { NextBottlePanel } from "@/v3/components/Dashboard/NextBottlePanel";
import { NextEventCard } from "@/v3/components/Dashboard/NextEventCard";
import { NextSleepPanel } from "@/v3/components/Dashboard/NextSleepPanel";
import { StartBottleButton } from "@/v3/components/Dashboard/StartBottleButton";
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
  const { drawer, openCreate, close, onSave, onDelete } = useDrawer(
    actuals,
    saveEvent,
    deleteOptimistic,
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

  if (dayLoading || settingsLoading) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading today" />
      </div>
    );
  }

  // Wake gate: explicit undefined check — `wakeTime: 0` is technically
  // valid (midnight) and must NOT be treated as "no day yet". Settings
  // is guaranteed present post-§F3 onboarding (layout redirects to
  // /welcome otherwise), so `!settings` collapses to a defensive load
  // state rather than a first-time-bootstrap branch.
  if (!settings) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading today" />
      </div>
    );
  }
  if (!day || day.wakeTime === undefined) {
    const handleStart = async () => {
      await startNewDay(db, CHILD_ID, {
        newDayId: `day-${Date.now()}`,
        newDate: todayDate(),
        newWakeTime: settings.defaultWakeTime,
      });
    };
    return (
      <div className={styles.firstDayGate}>
        <ActionButton variant="primary" onClick={() => void handleStart()}>
          Start first day
        </ActionButton>
      </div>
    );
  }

  const next = nextDashboardEvent(projected, nowMinutes);

  const nb = nextBottle(projected, nowMinutes);
  const nn = nextNap(projected, nowMinutes);
  const cww = currentWakeWindow(projected, nowMinutes);
  const inProgressNap = actuals.find(
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
  // "Next" ordinals = unique nap/bottle slots that are RECORDED (the
  // user committed a specific time). Owner-only annotations have a
  // non-recorded lifecycle and don't bump the ordinal. Dedupe by
  // eventKey so the Start/End pair (same doc updated) doesn't double-count.
  const uniqueRecordedKeys = (type: Event["type"]) => {
    const seen = new Set<string>();
    for (const e of actuals) {
      if (e.type !== type) continue;
      if (!isRecorded(e.lifecycle)) continue;
      seen.add(e.eventKey);
    }
    return seen.size;
  };
  const nextBottleNumber = uniqueRecordedKeys("bottle") + 1;
  const lastBottle = lastEventOfType(actuals, "bottle");
  const lastBottleTime = lastBottle?.startTime;
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
  const handleStartNap = async (nap: Event) => {
    await saveEvent(nap);
  };
  const handleStartBedtime = async (bedtime: Event) => {
    await saveEvent(bedtime);
  };
  // TIME_EDIT on a recorded nap → completed.
  const handleEndNap = async (event: Event, endTime: number) => {
    if (!day || day.id === "") return;
    await saveEvent({
      ...event,
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
  const handleStartDay = async ({ useTomorrowPlan: _ }: { useTomorrowPlan: boolean }) => {
    // See note above — anchor the new day at `settings.defaultWakeTime`,
    // not wall-clock. `settings` is always non-null here (past the loading
    // + wake gates), so a fallback isn't structurally needed.
    await startNewDay(db, CHILD_ID, {
      newDayId: `day-${Date.now()}`,
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
        <StartBottleButton
          defaultAmountOz={settings.defaultBottleAmountOz}
          dayId={day.id}
          nextNumber={nextBottleNumber}
          onLog={handleLogBottle}
          minIntervalMinutes={settings.minBottleIntervalMinutes ?? 20}
          {...(lastBottleTime !== undefined ? { lastBottleTime } : {})}
        />
        <div className={styles.actionsRow}>
          <NapActionButton
            inProgressNap={inProgressNap}
            inProgressBedtime={inProgressBedtime}
            dayId={day.id}
            nowMinutes={nowMinutes}
            bedtimeThreshold={settings.bedtimeThreshold}
            defaultNapLengthMinutes={settings.defaultNapLengthMinutes}
            defaultWakeTime={settings.defaultWakeTime}
            {...(nn ? { nextProjectedNap: nn } : {})}
            onStart={handleStartNap}
            onEnd={handleEndNap}
            onStartBedtime={handleStartBedtime}
            onEndBedtime={async () => setWakeSheetOpen(true)}
          />
          {process.env.NODE_ENV === "development" && (
            <StartDayButton hasTomorrowPlan={false} onStart={handleStartDay} />
          )}
        </div>
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

function lastEventOfType(events: Event[], type: Event["type"]): Event | undefined {
  return events
    .filter((e) => e.type === type && isRecorded(e.lifecycle))
    .sort((a, b) => b.startTime - a.startTime)[0];
}
