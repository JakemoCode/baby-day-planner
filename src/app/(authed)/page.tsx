"use client";

import { useMemo, useState } from "react";
import type { Event, OwnershipTemplate } from "@/v3/schemas";
import { isRecorded } from "@/v3/schemas";
import { reduceLifecycle } from "@/v3/lifecycle";
import {
  currentWakeWindow,
  nextBottle,
  nextEvent,
  nextNap,
  projectedBedtime,
} from "@/v3/selectors";
import { useNowMinutes } from "@/hooks/useNowMinutes";
import { isPersistedActual } from "@/v3/lib/isPersistedActual";
import { newEventId } from "@/v3/lib/newEventId";
import { useV3Day } from "@/v3/hooks/useV3Day";
import { useV3Events } from "@/v3/hooks/useV3Events";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { useV3Templates } from "@/v3/hooks/useV3Templates";
import { useV3Projection } from "@/v3/hooks/useV3Projection";
import { PLACEHOLDER_DAY, PLACEHOLDER_SETTINGS } from "@/v3/hooks/projectionPlaceholders";
import { getOrCreatePlannedDay, startNewDay } from "@/v3/repositories/days";
import { createEvent } from "@/v3/repositories/events";
import { saveSettings } from "@/v3/repositories/settings";
import { DEFAULT_WAKE_TIME, withV3SettingsDefaults } from "@/v3/firestore/settingsDefaults";
import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import { FAB } from "@/components/shared/FAB";
import { FABTypePicker } from "@/components/shared/FABTypePicker";
import type { CreatableType } from "@/v3/components/shared/createEventTemplate";
import { buildCreateTemplate } from "@/v3/components/shared/createEventTemplate";
import { EventEditDrawerV3 } from "@/v3/components/shared/EventEditDrawerV3";
import { CurrentWakeWindowStatus } from "@/v3/components/Dashboard/CurrentWakeWindowStatus";
import { EndOfDayCard } from "@/v3/components/Dashboard/EndOfDayCard";
import { NapActionButton } from "@/v3/components/Dashboard/NapActionButton";
import { NextBottlePreview } from "@/v3/components/Dashboard/NextBottlePreview";
import { NextEventCard } from "@/v3/components/Dashboard/NextEventCard";
import { NextNapPreview } from "@/v3/components/Dashboard/NextNapPreview";
import { StartBottleButton } from "@/v3/components/Dashboard/StartBottleButton";
import { StartDayButton } from "@/v3/components/Dashboard/StartDayButton";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

type DrawerState =
  | { open: false }
  | { open: true; mode: "create"; template: Event }
  | { open: true; mode: "edit"; event: Event };

function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DashboardPage() {
  const nowMinutes = useNowMinutes();
  const { day, loading: dayLoading } = useV3Day(CHILD_ID);
  const { settings, loading: settingsLoading } = useV3Settings(CHILD_ID);
  const {
    events: actuals,
    createOptimistic,
    updateOptimistic,
  } = useV3Events(CHILD_ID, day?.id ?? "", settings?.owners);
  const { templates } = useV3Templates(CHILD_ID);
  const [drawer, setDrawer] = useState<DrawerState>({ open: false });
  const [pickerOpen, setPickerOpen] = useState(false);

  const template = useMemo<OwnershipTemplate | undefined>(() => {
    if (!day?.templateId) return undefined;
    return templates.find((t) => t.id === day.templateId);
  }, [day, templates]);

  // Hook order must stay stable, so we always call useV3Projection with
  // PLACEHOLDER_DAY/PLACEHOLDER_SETTINGS when the real values aren't loaded.
  // The early return below ensures projected output is never rendered with
  // those placeholders.
  const projected = useV3Projection({
    day: day ?? PLACEHOLDER_DAY,
    settings: settings ?? PLACEHOLDER_SETTINGS,
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
  // valid (midnight) and must NOT be treated as "no day yet".
  if (!day || !settings || day.wakeTime === undefined) {
    const handleStart = async () => {
      // First-time bootstrap: if the user has no Settings doc yet (fresh
      // install, wiped emulator, etc.), seed defaults BEFORE creating
      // the day. Without this, the dashboard renders past the day-write
      // but the wake-gate fires again on `!settings`, indistinguishable
      // from "nothing happened." Idempotent: when settings exist we skip.
      if (!settings) {
        const defaults = withV3SettingsDefaults({ childId: CHILD_ID })!;
        await saveSettings(db, CHILD_ID, defaults);
      }
      // Anchor the new day at `settings.defaultWakeTime` (or the just-
      // seeded default), not wall-clock. Tapping Start at 2:30 PM
      // should NOT rotate the projected day to start at 2:30 PM.
      await startNewDay(db, CHILD_ID, {
        newDayId: `day-${Date.now()}`,
        newDate: todayDate(),
        newWakeTime: settings?.defaultWakeTime ?? DEFAULT_WAKE_TIME,
      });
    };
    return (
      <div className={styles.page}>
        <EndOfDayCard afterMidnight hasTomorrowPlan={false} onStart={handleStart} />
      </div>
    );
  }

  const next = nextEvent(projected, nowMinutes);
  const afterBedtime = nowMinutes >= settings.bedtimeThreshold;
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
  const inProgressNap = actuals.find((e) => e.type === "nap" && e.lifecycle.state === "started");
  const bottle1Pending = !actuals.some((e) => e.type === "bottle" && isRecorded(e.lifecycle));

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
  const nextNapNumber = uniqueRecordedKeys("nap") + 1;
  const lastBottle = lastEventOfType(actuals, "bottle");
  const lastNap = lastEventOfType(actuals, "nap");
  const lastBottleTime = lastBottle?.startTime;
  const bedtime = projectedBedtime(projected);

  // Smart suppression: when NextEventCard already announces the same fact a
  // preview card would, hide the preview to avoid redundancy.
  const nextType = next?.type;
  const hideBottlePreview = nextType === "bottle";
  // V3 has no top-level "putdown" EventType; putdowns are render-only,
  // injected by `expandPutdown` in TimelineV3 and never surface through
  // `nextEvent(projected, ...)`. So nap + bedtime cover the suppression.
  const hideNapPreview = nextType === "nap" || nextType === "bedtime";

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
    await createOptimistic(bottle);
  };
  const handleStartNap = async (nap: Event) => {
    await createOptimistic(nap);
  };
  const handleStartBedtime = async (bedtime: Event) => {
    await createOptimistic(bedtime);
  };
  const handleEndNap = async (nap: Event, endTime: number) => {
    if (!day || day.id === "") return;
    // committedAt on a completed nap = the START time (preserved from the
    // `started` lifecycle), NOT the end time. reduceLifecycle handles this
    // — END copies committedAt forward from the started state.
    await updateOptimistic(nap.id, {
      endTime,
      lifecycle: reduceLifecycle(nap.lifecycle, { type: "END", at: endTime }),
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
      <NextEventCard event={next} nowMinutes={nowMinutes} owners={settings.owners} />
      {!hideBottlePreview && (
        <NextBottlePreview
          bottle={nb}
          bottle1Pending={bottle1Pending}
          owners={settings.owners}
          {...(lastBottle ? { lastBottle } : {})}
        />
      )}
      {!hideNapPreview && (
        <NextNapPreview
          nap={nn}
          owners={settings.owners}
          {...(lastNap ? { lastNap } : {})}
          {...(bedtime ? { bedtime } : {})}
        />
      )}
      <CurrentWakeWindowStatus wakeWindow={cww} owners={settings.owners} />

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
            dayId={day.id}
            nowMinutes={nowMinutes}
            bedtimeThreshold={settings.bedtimeThreshold}
            {...(nn ? { nextProjectedNap: nn } : {})}
            onStart={handleStartNap}
            onEnd={handleEndNap}
            onStartBedtime={handleStartBedtime}
          />
          <StartDayButton hasTomorrowPlan={false} onStart={handleStartDay} />
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
          setDrawer({ open: true, mode: "create", template: tpl });
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
        existingEvents={projected}
        open={drawer.open}
        event={drawer.open ? (drawer.mode === "edit" ? drawer.event : drawer.template) : null}
        mode={drawer.open && drawer.mode === "edit" ? "edit" : "create"}
        onSave={async (event) => {
          if (drawer.open && drawer.mode === "edit") {
            if (isPersistedActual(drawer.event.id, actuals)) {
              await updateOptimistic(event.id, event);
            } else {
              await createOptimistic({ ...event, id: newEventId("manual") });
            }
          } else {
            await createOptimistic(event);
          }
          setDrawer({ open: false });
        }}
        onCancel={() => setDrawer({ open: false })}
      />
    </div>
  );
}

function lastEventOfType(events: Event[], type: Event["type"]): Event | undefined {
  return events
    .filter((e) => e.type === type && isRecorded(e.lifecycle))
    .sort((a, b) => b.startTime - a.startTime)[0];
}
