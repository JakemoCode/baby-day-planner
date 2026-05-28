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
  /** Which event types the picker offers. Defaults to all creatable
   * types; /tomorrow narrows it to plan-ahead types only (no off-cycle
   * bottle/pump, which are logged live, not pre-planned). */
  types?: readonly CreatableType[];
  /** Open the edit drawer in create mode with the built template. */
  onCreate: (template: Event) => void;
};

export function AddEventFAB({
  dayId,
  actuals,
  settings,
  nowMinutes,
  projected,
  types,
  onCreate,
}: AddEventFABProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const create = (type: CreatableType) => {
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
  };

  // With only one type on offer, the picker is a pointless extra tap —
  // the FAB opens that type's create form directly (/tomorrow: Custom).
  const soleType = types?.length === 1 ? types[0] : undefined;

  if (soleType !== undefined) {
    return <FAB label="Add an event" onClick={() => create(soleType)} />;
  }

  return (
    <>
      <FAB label="Add an event" onClick={() => setPickerOpen(true)} />
      <FABTypePicker
        open={pickerOpen}
        {...(types ? { types } : {})}
        onSelect={(type: CreatableType) => {
          setPickerOpen(false);
          create(type);
        }}
        onCancel={() => setPickerOpen(false)}
      />
    </>
  );
}
