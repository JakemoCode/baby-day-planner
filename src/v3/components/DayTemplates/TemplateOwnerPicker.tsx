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

export type TemplateOwnerPickerProps = {
  event: Event;
  template: OwnershipTemplate;
  owners: OwnersConfig;
  onSelect: (owner: OwnerRef | undefined) => void;
};

const NAP_RE = /^nap_(\d+)$/;
const WAKE_RE = /^wake_window_(\d+)$/;
const BOTTLE_RE = /^bottle_(\d+)$/;

function indexOf(re: RegExp, eventKey: string): number {
  const m = re.exec(eventKey);
  if (!m) return -1;
  return Number(m[1]) - 1;
}

/**
 * Read the OwnerRef the template currently assigns to this event, or
 * undefined when the slot is empty / unrecognised. Mirrors the dispatch
 * in setOwnerInTemplate so the picker shows the same source of truth
 * the page will mutate.
 */
function ownerFromTemplate(template: OwnershipTemplate, event: Event): OwnerRef | undefined {
  const { eventKey } = event;

  if (eventKey === "bedtime") {
    return template.bedtimeOwner;
  }

  const napIdx = indexOf(NAP_RE, eventKey);
  if (napIdx >= 0) return template.napOwners[napIdx];

  const wwIdx = indexOf(WAKE_RE, eventKey);
  if (wwIdx >= 0) return template.wakeWindowOwners[wwIdx];

  const bottleIdx = indexOf(BOTTLE_RE, eventKey);
  if (bottleIdx >= 0) return (template.bottleOwners ?? [])[bottleIdx];

  return undefined;
}

export function TemplateOwnerPicker({
  event,
  template,
  owners,
  onSelect,
}: TemplateOwnerPickerProps) {
  const current = ownerFromTemplate(template, event);
  return <OwnerPickerV3 owners={owners} value={current} onChange={onSelect} label={event.label} />;
}
