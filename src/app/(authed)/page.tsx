"use client";

import { useMemo, useState } from "react";
import type { Event, OwnershipTemplate } from "@/domain";
import { currentWakeWindow, nextBottle, nextEvent, nextNap, parseTime, projectDay } from "@/domain";
import { useDay } from "@/hooks/useDay";
import { useEvents } from "@/hooks/useEvents";
import { useSettings } from "@/hooks/useSettings";
import { useTemplates } from "@/hooks/useTemplates";
import { useNowMinutes } from "@/hooks/useNowMinutes";
import { startNewDay } from "@/repositories/startNewDay";
import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import { FAB } from "@/components/shared/FAB";
import { FABTypePicker } from "@/components/shared/FABTypePicker";
import { EventEditDrawer } from "@/components/shared/EventEditDrawer";
import { buildCreateTemplate, type CreatableType } from "@/components/shared/createEventTemplate";
import { CurrentWakeWindowStatus } from "@/components/Dashboard/CurrentWakeWindowStatus";
import { EndOfDayCard } from "@/components/Dashboard/EndOfDayCard";
import { NapActionButton } from "@/components/Dashboard/NapActionButton";
import { NextBottlePreview } from "@/components/Dashboard/NextBottlePreview";
import { NextEventCard } from "@/components/Dashboard/NextEventCard";
import { NextNapPreview } from "@/components/Dashboard/NextNapPreview";
import { StartBottleButton } from "@/components/Dashboard/StartBottleButton";
import { StartDayButton } from "@/components/Dashboard/StartDayButton";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

type DrawerState =
  | { open: false }
  | { open: true; mode: "create"; template: Event }
  | { open: true; mode: "edit"; event: Event };

export default function DashboardPage() {
  const nowMinutes = useNowMinutes();
  const { day, loading: dayLoading } = useDay(CHILD_ID);
  const { settings, loading: settingsLoading } = useSettings(CHILD_ID);
  const { events: actuals, createOptimistic } = useEvents(CHILD_ID, day?.id ?? "");
  const { templates } = useTemplates(CHILD_ID);
  const [drawer, setDrawer] = useState<DrawerState>({ open: false });
  const [pickerOpen, setPickerOpen] = useState(false);

  const template = useMemo<OwnershipTemplate | undefined>(() => {
    if (!day?.ownershipTemplateId) return undefined;
    return templates.find((t) => t.id === day.ownershipTemplateId);
  }, [day, templates]);

  const projected = useMemo(() => {
    if (!day || !settings) return [];
    return projectDay({
      day,
      settings,
      actuals,
      ...(template ? { template } : {}),
      nowMinutes,
    });
  }, [day, settings, actuals, template, nowMinutes]);

  if (dayLoading || settingsLoading) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading today" />
      </div>
    );
  }

  // No active day → start-of-day prompt
  if (!day || !settings || !day.wakeTime) {
    const handleStart = async () => {
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const wakeTime = formatNowAsHHMM();
      await startNewDay(db, CHILD_ID, {
        newDayId: `day-${Date.now()}`,
        newDate: today,
        newWakeTime: wakeTime,
        now,
      });
    };
    return (
      <div className={styles.page}>
        <EndOfDayCard afterMidnight hasTomorrowPlan={false} onStart={() => handleStart()} />
      </div>
    );
  }

  // After bedtime, no upcoming events
  const next = nextEvent(projected, nowMinutes);
  const bedtimeMinutes = parseTime(settings.bedtimeThreshold);
  const afterBedtime = nowMinutes >= bedtimeMinutes;
  const isEndOfDay = !next && afterBedtime;

  if (isEndOfDay) {
    return (
      <div className={styles.page}>
        <EndOfDayCard
          afterMidnight={false}
          hasTomorrowPlan={false}
          onStart={async () => {
            // Won't fire pre-midnight, but kept for type safety
          }}
        />
      </div>
    );
  }

  const nb = nextBottle(projected, nowMinutes);
  const nn = nextNap(projected, nowMinutes);
  const cww = currentWakeWindow(projected, nowMinutes);
  const inProgressNap = actuals.find((e) => e.type === "nap" && !e.endTime);
  const bottle1Pending = !actuals.some((e) => e.type === "bottle");
  const nextBottleNumber = countByType(actuals, "bottle") + 1;
  const nextNapNumber = countByType(actuals, "nap") + 1;
  const lastBottleTime = lastTimeForType(actuals, "bottle");

  const handleLogBottle = async (bottle: Event) => {
    await createOptimistic(bottle);
  };
  const handleStartNap = async (nap: Event) => {
    await createOptimistic(nap);
  };
  const handleEndNap = async (nap: Event, endTime: string) => {
    // Update via createOptimistic since we don't expose updateOptimistic at this level here
    // (could refactor to use updateOptimistic — for v1 we recreate the doc).
    await createOptimistic({ ...nap, endTime, status: "completed" });
  };
  const handleStartDay = async ({ useTomorrowPlan: _ }: { useTomorrowPlan: boolean }) => {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    await startNewDay(db, CHILD_ID, {
      newDayId: `day-${Date.now()}`,
      newDate: today,
      newWakeTime: formatNowAsHHMM(),
      now,
    });
  };

  return (
    <div className={styles.page}>
      <NextEventCard event={next} nowMinutes={nowMinutes} />
      <NextBottlePreview bottle={nb} bottle1Pending={bottle1Pending} />
      <NextNapPreview nap={nn} />
      <CurrentWakeWindowStatus wakeWindow={cww} />

      <div className={styles.actions}>
        <StartBottleButton
          defaultAmountOz={settings.defaultBottleAmountOz}
          dayId={day.id}
          nextNumber={nextBottleNumber}
          onLog={handleLogBottle}
          minIntervalMinutes={settings.minBottleIntervalMinutes ?? 20}
          {...(lastBottleTime ? { lastBottleTime } : {})}
        />
        <div className={styles.actionsRow}>
          <NapActionButton
            inProgressNap={inProgressNap}
            dayId={day.id}
            nextNumber={nextNapNumber}
            onStart={handleStartNap}
            onEnd={handleEndNap}
          />
          <StartDayButton hasTomorrowPlan={false} onStart={handleStartDay} />
        </div>
      </div>

      <FAB label="Add an event" onClick={() => setPickerOpen(true)} />

      <FABTypePicker
        open={pickerOpen}
        onSelect={(type: CreatableType) => {
          setPickerOpen(false);
          const template = buildCreateTemplate({
            type,
            dayId: day.id,
            actuals,
            settings,
            nowHHMM: formatNowAsHHMM(),
          });
          setDrawer({ open: true, mode: "create", template });
        }}
        onCancel={() => setPickerOpen(false)}
      />

      <EventEditDrawer
        key={
          drawer.open && drawer.mode === "edit"
            ? drawer.event.id
            : drawer.open && drawer.mode === "create"
              ? drawer.template.id
              : "closed"
        }
        open={drawer.open}
        event={drawer.open ? (drawer.mode === "edit" ? drawer.event : drawer.template) : null}
        mode={drawer.open && drawer.mode === "edit" ? "edit" : "create"}
        onSave={async (event) => {
          await createOptimistic(event);
          setDrawer({ open: false });
        }}
        onCancel={() => setDrawer({ open: false })}
      />
    </div>
  );
}

function countByType(events: Event[], type: Event["type"]): number {
  return events.filter((e) => e.type === type).length;
}

function lastTimeForType(events: Event[], type: Event["type"]): string | undefined {
  const matches = events
    .filter((e) => e.type === type)
    .sort((a, b) => parseTime(b.startTime) - parseTime(a.startTime));
  return matches[0]?.startTime;
}

function formatNowAsHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
