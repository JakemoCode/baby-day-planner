"use client";

/** Shared EventEditDrawerV3 mount for dashboard and timeline. Tomorrow page mounts its own. */

import type { Event, Settings, TimeMin, Day } from "../../schemas";
import type { DrawerState } from "../../hooks/useDrawer";
import { EventEditDrawerV3 } from "./EventEditDrawerV3";

export type DrawerShellProps = {
  drawer: DrawerState;
  settings: Settings;
  day: Day;
  nowMinutes: TimeMin;
  projected: Event[];
  onSave: (event: Event) => Promise<void> | void;
  onDelete: (event: Event) => Promise<void> | void;
  onCancel: () => void;
};

export function DrawerShell(props: DrawerShellProps): React.JSX.Element {
  const { drawer, settings, day, nowMinutes, projected, onSave, onDelete, onCancel } = props;
  let key = "closed";
  if (drawer.open) {
    key = drawer.mode === "edit" ? drawer.event.id : drawer.template.id;
  }

  return (
    <EventEditDrawerV3
      key={key}
      owners={settings.owners}
      nowMinutes={nowMinutes}
      bedtimeThreshold={settings.bedtimeThreshold}
      defaultWakeTime={settings.defaultWakeTime}
      napDurationMin={settings.napDurationMin}
      {...(day.wakeTime !== undefined ? { dayWakeTime: day.wakeTime } : {})}
      existingEvents={projected}
      open={drawer.open}
      event={drawer.open ? (drawer.mode === "edit" ? drawer.event : drawer.template) : null}
      mode={drawer.open && drawer.mode === "edit" ? "edit" : "create"}
      onSave={onSave}
      onDelete={onDelete}
      onCancel={onCancel}
    />
  );
}
