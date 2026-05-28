"use client";

import { useState } from "react";
import type { Event, Settings, TimeMin } from "../../schemas";
import { FAB } from "@/components/shared/FAB";
import { FABTypePicker } from "@/components/shared/FABTypePicker";
import { buildCreateTemplate, type CreatableType } from "./createEventTemplate";

export type AddEventFABProps = {
  dayId: string;
  actuals: Event[];
  settings: Settings;
  /** Time anchor for the new event's default startTime. */
  nowMinutes: TimeMin;
  /** Engine projections, when the page has them — used by
   * buildCreateTemplate to avoid colliding a new event's slot with a
   * projected one. Omitted on the tomorrow page (plan-only, no cascade). */
  projected?: Event[];
  /** Open the edit drawer in create mode with the built template. */
  onCreate: (template: Event) => void;
};

export function AddEventFAB({
  dayId,
  actuals,
  settings,
  nowMinutes,
  projected,
  onCreate,
}: AddEventFABProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <FAB label="Add an event" onClick={() => setPickerOpen(true)} />
      <FABTypePicker
        open={pickerOpen}
        onSelect={(type: CreatableType) => {
          setPickerOpen(false);
          onCreate(
            buildCreateTemplate({
              type,
              dayId,
              actuals,
              settings,
              nowMinutes,
              ...(projected ? { projected } : {}),
            }),
          );
        }}
        onCancel={() => setPickerOpen(false)}
      />
    </>
  );
}
