/**
 * Updates one owner slot on an OwnershipTemplate by eventKey; undefined = clear; unknown key = no-op.
 * See setOwnerInTemplate.test.ts for gap-fill contract.
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
