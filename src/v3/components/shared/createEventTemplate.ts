/**
 * V3 seed-event factory for the FAB-driven "add event" flow.
 *
 * Returns a fully-shaped V3 Event in `lifecycle: { state: "projected" }`
 * — the drawer's `formToEvent` transform decides the final lifecycle
 * state based on what the user changes (time edit → completed/started,
 * owner-only edit → overridden).
 *
 * Sequential `eventKey`s for chained types (`bottle_N`, `nap_N`)
 * anchor the engine's cascade so chained projections continue from
 * the new event.
 */

import type { Event, EventType, Settings, TimeMin } from "../../schemas";

export type CreatableType = "bottle" | "nap" | "pump" | "extra";

export type BuildTemplateInput = {
  type: CreatableType;
  dayId: string;
  actuals: Event[];
  settings: Settings;
  /** Current time as TimeMin so the form opens with a sensible default. */
  nowMinutes: TimeMin;
};

export function buildCreateTemplate({
  type,
  dayId,
  actuals,
  settings,
  nowMinutes,
}: BuildTemplateInput): Event {
  const idStamp = Date.now();

  if (type === "bottle") {
    const nextN = countByType(actuals, "bottle") + 1;
    return {
      id: `bottle-${idStamp}`,
      dayId,
      eventKey: `bottle_${nextN}`,
      type: "bottle",
      kind: "instant",
      label: `Bottle ${nextN}`,
      startTime: nowMinutes,
      amountOz: settings.defaultBottleAmountOz,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
  }

  if (type === "nap") {
    const nextN = countByType(actuals, "nap") + 1;
    return {
      id: `nap-${idStamp}`,
      dayId,
      eventKey: `nap_${nextN}`,
      type: "nap",
      kind: "block",
      label: `Nap ${nextN}`,
      startTime: nowMinutes,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
  }

  if (type === "pump") {
    return {
      id: `pump-${idStamp}`,
      dayId,
      eventKey: `pump_${idStamp}`,
      type: "pump",
      kind: "instant",
      label: "Pump",
      startTime: nowMinutes,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
  }

  return {
    id: `extra-${idStamp}`,
    dayId,
    eventKey: `extra_${idStamp}`,
    type: "extra",
    kind: "block",
    label: "",
    startTime: nowMinutes,
    hasPutdown: false,
    lifecycle: { state: "projected" },
  };
}

function countByType(events: Event[], type: EventType): number {
  return events.filter((e) => e.type === type).length;
}
