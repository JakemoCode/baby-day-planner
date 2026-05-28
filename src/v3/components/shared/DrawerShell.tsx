"use client";

/**
 * Standard <EventEditDrawerV3> mount used by both the dashboard and
 * timeline pages. Owns the `key=` reset-on-event-id ternary and the
 * `dayWakeTime` conditional spread that both pages used to spell out
 * verbatim. Tomorrow page mounts the drawer differently (no Day doc
 * yet, plan-state-driven) and stays inline.
 */

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
  const key =
    drawer.open && drawer.mode === "edit"
      ? drawer.event.id
      : drawer.open && drawer.mode === "create"
        ? drawer.template.id
        : "closed";

  return (
    <EventEditDrawerV3
      key={key}
      owners={settings.owners}
      nowMinutes={nowMinutes}
      bedtimeThreshold={settings.bedtimeThreshold}
      defaultWakeTime={settings.defaultWakeTime}
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
