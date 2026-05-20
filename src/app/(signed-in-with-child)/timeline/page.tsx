"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Event, OwnershipTemplate } from "@/v3/schemas";
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
import { useCurrentChild } from "@/v3/context/ChildProvider";

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
  const CHILD_ID = useCurrentChild().id;
  const nowMinutes = useNowMinutes();
  const { day, loading: dayLoading } = useV3Day(CHILD_ID);
  const { settings, loading: settingsLoading } = useV3Settings(CHILD_ID);
  const { events: actuals, saveEvent, deleteOptimistic } = useV3Events(CHILD_ID, day?.id ?? "");
  const { templates } = useV3Templates(CHILD_ID);
  const [drawer, setDrawer] = useState<DrawerState>({ open: false });
  const [pickerOpen, setPickerOpen] = useState(false);

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
        colorMode={settings.timelineColorMode}
        nowMinutes={nowMinutes}
        scrollToNowOnMount
        pxPerHour={settings.timelinePxPerHour}
        dimPast={settings.timelineDimPast}
        viewportPaddingMin={12}
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
        bedtimeThreshold={settings.bedtimeThreshold}
        defaultWakeTime={settings.defaultWakeTime}
        existingEvents={projected}
        open={drawer.open}
        event={drawer.open ? (drawer.mode === "edit" ? drawer.event : drawer.template) : null}
        mode={drawer.open && drawer.mode === "edit" ? "edit" : "create"}
        onSave={async (event) => {
          if (
            drawer.open &&
            drawer.mode === "edit" &&
            !actuals.some((e) => e.id === drawer.event.id)
          ) {
            // Editing a projected (non-persisted) event: re-ID so it lands
            // as a new actual rather than colliding with the projected slot.
            // §F37 follow-up: use a DETERMINISTIC id derived from eventKey
            // (was random `newEventId("manual")`). Random ids meant each
            // subsequent edit of the same projection created ANOTHER override
            // doc — wake_window owners changed "intermittently" because R4.2
            // picked the survivor by Map iteration order over the accumulated
            // duplicates. Stable id → 2nd+ edit routes through `updateOptimistic`
            // on the same doc.
            await saveEvent({ ...event, id: `recorded_${event.eventKey}` });
          } else {
            await saveEvent(event);
          }
          setDrawer({ open: false });
        }}
        onCancel={() => setDrawer({ open: false })}
        onDelete={async (event) => {
          if (
            drawer.open &&
            drawer.mode === "edit" &&
            !actuals.some((e) => e.id === drawer.event.id)
          ) {
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
