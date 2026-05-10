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
 * V3 differences from V2:
 *   - Owners are slot-based OwnerRef values (not "Jake" / "Kelly" /
 *     "Daycare" display strings).
 *   - The option list is derived from settings.owners at render time
 *     by OwnerPickerV3.
 *   - onSelect emits `OwnerRef | undefined`; undefined ("None") is the
 *     valid signal to clear the slot.
 *
 * The actual template mutation lives in setOwnerInTemplate (PR-A0.3) —
 * this component is purely about reading the current value and emitting
 * the picked one.
 */

import type { Event, OwnerRef, OwnershipTemplate, OwnersConfig } from "../../schemas";
import { OwnerPickerV3 } from "../shared/OwnerPickerV3";
import { getOwnerAt, templateSlotForEvent } from "./templateSlot";

export type TemplateOwnerPickerProps = {
  event: Event;
  template: OwnershipTemplate;
  owners: OwnersConfig;
  onSelect: (owner: OwnerRef | undefined) => void;
};

export function TemplateOwnerPicker({
  event,
  template,
  owners,
  onSelect,
}: TemplateOwnerPickerProps) {
  const slot = templateSlotForEvent(event);
  const current = slot === undefined ? undefined : getOwnerAt(template, slot);
  return <OwnerPickerV3 owners={owners} value={current} onChange={onSelect} label={event.label} />;
}
