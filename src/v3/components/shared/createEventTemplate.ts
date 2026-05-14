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

import { newEventId } from "../../lib/newEventId";
import { isRecorded } from "../../schemas";
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
  if (type === "bottle") {
    const nextN = countByType(actuals, "bottle") + 1;
    return {
      id: newEventId("bottle"),
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
      id: newEventId("nap"),
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
    const pumpId = newEventId("pump");
    return {
      id: pumpId,
      dayId,
      eventKey: pumpId,
      type: "pump",
      kind: "instant",
      label: "Pump",
      startTime: nowMinutes,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
  }

  // Custom (extra) events default to instant. If the user fills in an
  // endTime in the drawer, formToEvent upgrades kind to "block" on save.
  const extraId = newEventId("extra");
  return {
    id: extraId,
    dayId,
    eventKey: extraId,
    type: "extra",
    kind: "instant",
    label: "",
    startTime: nowMinutes,
    hasPutdown: false,
    lifecycle: { state: "projected" },
  };
}

/**
 * Count events of a given type that are RECORDED (started/completed).
 * Projected entries are excluded so the FAB-create ordinal agrees with
 * the dashboard's `uniqueRecordedKeys` count — otherwise a lingering
 * projected bottle would push FAB-created events to `bottle_N+1` while
 * StartBottleButton emits `bottle_N`.
 */
function countByType(events: Event[], type: EventType): number {
  return events.filter((e) => e.type === type && isRecorded(e.lifecycle)).length;
}
