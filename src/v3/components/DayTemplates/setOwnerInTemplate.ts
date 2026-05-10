/**
 * Update a single owner slot on an OwnershipTemplate based on the
 * event's `eventKey`. See setOwnerInTemplate.test.ts for the
 * behavioral contract (gap-fill semantics, undefined = clear,
 * unknown eventKey = no-op).
 *
 * Thin wrapper over the shared dispatch in `./templateSlot`. The same
 * dispatch is used by TemplateOwnerPicker on the read side.
 *
 * V3 differences from V2:
 *  - Operates on OwnerRef (slot-based) not Owner (display string).
 *  - Dispatches on `eventKey` (`nap_N`, `wake_window_N`, `bottle_N`,
 *    `bedtime`) rather than `event.type`, since multiple types share
 *    indices via their key.
 *  - Gap-fills with `undefined` instead of a hardcoded V2 owner name.
 */

import type { Event, OwnerRef, OwnershipTemplate } from "../../schemas";
import { setOwnerAt, templateSlotForEvent } from "./templateSlot";

export function setOwnerInTemplate(
  template: OwnershipTemplate,
  event: Event,
  owner: OwnerRef | undefined,
): OwnershipTemplate {
  const slot = templateSlotForEvent(event);
  if (slot === undefined) return template;
  return setOwnerAt(template, slot, owner);
}
