"use client";

import { useState } from "react";
import type { TimeMin } from "@/v3/schemas";
import { useNowMinutes } from "@/hooks/useNowMinutes";
import { useDayPageState } from "@/v3/hooks/useDayPageState";
import { db } from "@/lib/firebase/client";
import { editWakeTime } from "@/v3/repositories/days";
import { LoadingState } from "@/components/shared/LoadingState";
import { EmptyState } from "@/components/shared/EmptyState";
import { FAB } from "@/components/shared/FAB";
import { FABTypePicker } from "@/components/shared/FABTypePicker";
import type { CreatableType } from "@/v3/components/shared/createEventTemplate";
import { buildCreateTemplate } from "@/v3/components/shared/createEventTemplate";
import { DrawerShell } from "@/v3/components/shared/DrawerShell";
import { EditableWakeTime } from "@/v3/components/Dashboard/EditableWakeTime";
import { TimelineV3 } from "@/v3/components/Timeline/TimelineV3";
import styles from "./page.module.css";
import { useCurrentChild } from "@/v3/context/ChildProvider";

export default function TimelinePage() {
  const CHILD_ID = useCurrentChild().id;
  const nowMinutes = useNowMinutes();
  const {
    day,
    dayLoading,
    settings,
    settingsLoading,
    actuals,
    projected,
    drawer,
    openCreate,
    openEdit,
    close,
    onSave,
    onDelete,
  } = useDayPageState(db, CHILD_ID);
  const [pickerOpen, setPickerOpen] = useState(false);

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
    </div>
  );
}
