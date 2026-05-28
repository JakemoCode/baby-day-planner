"use client";

/**
 * Owner picker for a single event in an OwnershipTemplate.
 * Derives current owner from the template (not event.owner) for optimistic updates.
 * Wraps in BottomSheet when title/onCancel provided; bare otherwise.
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
  // §F37: missing template entry treated as NO_OWNER (OwnerPickerV3 requires defined value).
  const picker = (
    <OwnerPickerV3
      owners={owners}
      value={current ?? NO_OWNER}
      onChange={onSelect}
      label={event.label}
    />
  );

  if (title === undefined && onCancel === undefined) return picker;

  return (
    <BottomSheet open={true} title={title ?? "Owner"} onCancel={onCancel ?? (() => undefined)}>
      {picker}
    </BottomSheet>
  );
}
