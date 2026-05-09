"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Event, OwnershipTemplate } from "@/v3/schemas";
import { isRecorded } from "@/v3/schemas";
import { useNowMinutes } from "@/hooks/useNowMinutes";
import { useV3Day } from "@/v3/hooks/useV3Day";
import { useV3Events } from "@/v3/hooks/useV3Events";
import { useV3Projection } from "@/v3/hooks/useV3Projection";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { useV3Templates } from "@/v3/hooks/useV3Templates";
import { LoadingState } from "@/components/shared/LoadingState";
import { EmptyState } from "@/components/shared/EmptyState";
import { FAB } from "@/components/shared/FAB";
import { FABTypePicker } from "@/components/shared/FABTypePicker";
import type { CreatableType } from "@/v3/components/shared/createEventTemplate";
import { buildCreateTemplate } from "@/v3/components/shared/createEventTemplate";
import { EventEditDrawerV3 } from "@/v3/components/shared/EventEditDrawerV3";
import { TimelineV3 } from "@/v3/components/Timeline/TimelineV3";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

type DrawerState =
  | { open: false }
  | { open: true; mode: "create"; template: Event }
  | { open: true; mode: "edit"; event: Event };

function yesterdayDate(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() - 1);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export default function TimelinePage() {
  const nowMinutes = useNowMinutes();
  const { day, loading: dayLoading } = useV3Day(CHILD_ID);
  const { settings, loading: settingsLoading } = useV3Settings(CHILD_ID);
  const {
    events: actuals,
    createOptimistic,
    updateOptimistic,
    deleteOptimistic,
  } = useV3Events(CHILD_ID, day?.id ?? "");
  const { templates } = useV3Templates(CHILD_ID);
  const [drawer, setDrawer] = useState<DrawerState>({ open: false });
  const [pickerOpen, setPickerOpen] = useState(false);

  const template = useMemo<OwnershipTemplate | undefined>(() => {
    if (!day?.templateId) return undefined;
    return templates.find((t) => t.id === day.templateId);
  }, [day, templates]);

  // useV3Projection requires day + settings; the early-return below
  // ensures the engine output is never rendered with the placeholders.
  // The placeholders exist only so React's hook order stays stable
  // (hooks can't be called conditionally).
  const projected = useV3Projection({
    day: day ?? PLACEHOLDER_DAY,
    settings: settings ?? PLACEHOLDER_SETTINGS,
    actuals,
    ...(template ? { template } : {}),
  });

  if (dayLoading || settingsLoading) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading timeline" />
      </div>
    );
  }

  if (!day || !settings) {
    return (
      <div className={styles.page}>
        <EmptyState title="No active day" body="Start a new day from the dashboard." />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={`/history/${yesterdayDate(day.date)}`} className={styles.backLink}>
          ← Yesterday
        </Link>
      </header>

      <TimelineV3
        events={projected}
        owners={settings.owners}
        putdownLeadMinutes={settings.putdownLeadMinutes}
        nowMinutes={nowMinutes}
        scrollToNowOnMount
        pxPerHour={settings.timelinePxPerHour}
        dimPast={settings.timelineDimPast}
        onEventTap={(event) => setDrawer({ open: true, mode: "edit", event })}
      />

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
            // Projected events are synthesized by the engine and have
            // no Firestore doc. The first user edit needs to CREATE an
            // override, not update a non-existent record. Give it a
            // fresh id so we don't write under the synthetic "proj-…"
            // key.
            if (!isRecorded(drawer.event.lifecycle)) {
              await createOptimistic({ ...event, id: `manual-${Date.now()}` });
            } else {
              await updateOptimistic(event.id, event);
            }
          } else {
            await createOptimistic(event);
          }
          setDrawer({ open: false });
        }}
        onCancel={() => setDrawer({ open: false })}
        onDelete={async (event) => {
          // Can't delete a projected event — no Firestore doc. Just
          // close the drawer.
          if (drawer.open && drawer.mode === "edit" && !isRecorded(drawer.event.lifecycle)) {
            setDrawer({ open: false });
            return;
          }
          await deleteOptimistic(event.id);
          setDrawer({ open: false });
        }}
      />
    </div>
  );
}

// useV3Projection has to be called every render to keep hook order
// stable; these placeholders fill in until day + settings load. The
// early-return above guarantees the engine output is never rendered
// with them.
const PLACEHOLDER_DAY = {
  id: "",
  childId: "",
  date: "",
  status: "active" as const,
  suppressedRecurringIds: [] as string[],
  suppressedDaycareDay: false,
};

const PLACEHOLDER_SETTINGS = {
  childId: "",
  defaultWakeTime: 7 * 60,
  bedtimeThreshold: 19 * 60,
  defaultNapLengthMinutes: 90,
  shortNapThresholdMinutes: 45,
  shortNapAdjustmentMinutes: 30,
  wakeWindowsMinutes: [] as number[],
  napDurationMin: 30,
  napDurationMax: 180,
  defaultBottleAmountOz: 5,
  defaultBottleIntervalMinutes: 180,
  bottleRules: [],
  bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
  minBottleIntervalMinutes: 90,
  putdownLeadMinutes: 15,
  pumpTimes: [] as number[],
  pumpOwnerSlot: "parent2" as const,
  dreamFeedEnabled: false,
  dreamFeedStart: 22 * 60,
  dreamFeedEnd: 23 * 60,
  dreamFeedOffsetAfterBedtimeMinutes: 180,
  dailyRecurring: [],
  daycare: {
    enabled: false,
    dropoffTime: 8 * 60,
    pickupTime: 17 * 60,
    ownerId: "",
    weekdays: {
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    },
  },
  owners: {
    parent1: { displayName: "", color: "#0af" },
    parent2: { displayName: "", color: "#f0a" },
    other: [] as Array<{ id: string; displayName: string; color: string }>,
  },
  timelinePxPerHour: 80,
  timelineDimPast: true,
};
