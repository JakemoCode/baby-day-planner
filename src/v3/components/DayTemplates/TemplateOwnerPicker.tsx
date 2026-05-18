"use client";

/**
 * V3 TemplateOwnerPicker.
 *
 * Renders OwnerPickerV3 for a single event in an OwnershipTemplate.
 * The picker derives the current owner from the template (not from
 * event.owner) so that callers updating the template optimistically
 * see the new selection without waiting for owner-aware events to
 * re-resolve.
 *
 * Chrome is opt-in. When `title` or `onCancel` is passed, the picker
 * wraps itself in a `BottomSheet` (the same drawer chrome the FAB type
 * picker uses). When neither is passed, the picker renders bare —
 * preserving the original headless behavior for callers that supply
 * their own wrapper.
 */

import { BottomSheet } from "@/components/shared/BottomSheet";
import {
  NO_OWNER,
  type Event,
  type OwnerRef,
  type OwnershipTemplate,
  type OwnersConfig,
} from "../../schemas";
import { OwnerPickerV3 } from "../shared/OwnerPickerV3";
import { getOwnerAt, templateSlotForEvent } from "./templateSlot";

export type TemplateOwnerPickerProps = {
  event: Event;
  template: OwnershipTemplate;
  owners: OwnersConfig;
  onSelect: (owner: OwnerRef | undefined) => void;
  /** Title shown in the BottomSheet chrome. */
  title?: string;
  /** Dismiss handler. When set, the picker renders inside a BottomSheet. */
  onCancel?: () => void;
};

export function TemplateOwnerPicker({
  event,
  template,
  owners,
  onSelect,
  title,
  onCancel,
}: TemplateOwnerPickerProps) {
  const slot = templateSlotForEvent(event);
  const current = slot === undefined ? undefined : getOwnerAt(template, slot);
  // §F37: OwnerPickerV3 now requires a defined value (NO_OWNER for unassigned).
  // A missing template entry is rendered the same as an explicit NO_OWNER.
  const picker = (
    <OwnerPickerV3
      owners={owners}
      value={current ?? NO_OWNER}
      onChange={onSelect}
      label={event.label}
    />
  );

  // No chrome requested → bare picker (preserves the original API).
  if (title === undefined && onCancel === undefined) return picker;

  return (
    <BottomSheet open={true} title={title ?? "Owner"} onCancel={onCancel ?? (() => undefined)}>
      {picker}
    </BottomSheet>
  );
}
