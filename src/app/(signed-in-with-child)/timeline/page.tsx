"use client";

import { useMemo, useState } from "react";
import type { OwnershipTemplate, TimeMin } from "@/v3/schemas";
import { useNowMinutes } from "@/hooks/useNowMinutes";
import { useV3Day } from "@/v3/hooks/useV3Day";
import { useV3Events } from "@/v3/hooks/useV3Events";
import { useV3Projection } from "@/v3/hooks/useV3Projection";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { useV3Templates } from "@/v3/hooks/useV3Templates";
import { useDrawer } from "@/v3/hooks/useDrawer";
import { db } from "@/lib/firebase/client";
import { editWakeTime, updateDayOwnerOverride } from "@/v3/repositories/days";
import { LoadingState } from "@/components/shared/LoadingState";
import { EmptyState } from "@/components/shared/EmptyState";
import { FAB } from "@/components/shared/FAB";
import { FABTypePicker } from "@/components/shared/FABTypePicker";
import type { CreatableType } from "@/v3/components/shared/createEventTemplate";
import { buildCreateTemplate } from "@/v3/components/shared/createEventTemplate";
import { EventEditDrawerV3 } from "@/v3/components/shared/EventEditDrawerV3";
import { EditableWakeTime } from "@/v3/components/Dashboard/EditableWakeTime";
import { TimelineV3 } from "@/v3/components/Timeline/TimelineV3";
import styles from "./page.module.css";
import { useCurrentChild } from "@/v3/context/ChildProvider";

export default function TimelinePage() {
  const CHILD_ID = useCurrentChild().id;
  const nowMinutes = useNowMinutes();
  const { day, loading: dayLoading } = useV3Day(CHILD_ID);
  const { settings, loading: settingsLoading } = useV3Settings(CHILD_ID);
  const { events: actuals, saveEvent, deleteOptimistic } = useV3Events(CHILD_ID, day?.id ?? "");
  const { templates } = useV3Templates(CHILD_ID);
  const { drawer, openCreate, openEdit, close, onSave, onDelete } = useDrawer(
    actuals,
    saveEvent,
    deleteOptimistic,
    day?.id
      ? (eventKey, owner) => updateDayOwnerOverride(db, CHILD_ID, day.id, eventKey, owner)
      : undefined,
  );
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

  const handleEditWakeTime = async (next: TimeMin) => {
    if (day.wakeTime === undefined) return;
    await editWakeTime(db, CHILD_ID, day.id, next);
  };

  return (
    <div className={styles.page}>
      {day.wakeTime !== undefined && (
        <div className={styles.wakeTimeContainer}>
          <EditableWakeTime
            wakeTime={day.wakeTime}
            onChange={(t) => void handleEditWakeTime(t)}
            variant="card"
          />
        </div>
      )}

      <TimelineV3
        events={projected}
        owners={settings.owners}
        colorMode={settings.timelineColorMode}
        nowMinutes={nowMinutes}
        scrollToNowOnMount
        pxPerHour={settings.timelinePxPerHour}
        dimPast={settings.timelineDimPast}
        viewportPaddingMin={12}
        onEventTap={openEdit}
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
        onCancel={close}
        onDelete={onDelete}
      />
    </div>
  );
}
