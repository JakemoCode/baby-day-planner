/**
 * Seed-event factory for the FAB "add event" flow. Returns a projected Event;
 * formToEvent decides the final lifecycle at save time.
 */

import { newEventId } from "../../lib/newEventId";
import { projectedLifecycle } from "../../lifecycle";
import { isRecorded, NO_OWNER } from "../../schemas";
import type { Event, EventType, Settings, TimeMin } from "../../schemas";

export type CreatableType = "bottle" | "pump" | "extra";

export type BuildTemplateInput = {
  type: CreatableType;
  dayId: string;
  actuals: Event[];
  settings: Settings;
  /** Current time as TimeMin so the form opens with a sensible default. */
  nowMinutes: TimeMin;
  /**
   * Engine projections for slot collision avoidance. Without this, the builder could
   * claim an eventKey already occupied by a projection. Omit on /tomorrow (no cascade).
   */
  projected?: Event[];
};

export function buildCreateTemplate({
  type,
  dayId,
  actuals,
  settings,
  nowMinutes,
  projected,
}: BuildTemplateInput): Event {
  if (type === "bottle") {
    const nextN = nextFreeSlot("bottle", actuals, projected);
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
      owner: NO_OWNER, // owner required; new events start unassigned
      lifecycle: projectedLifecycle(),
    };
  }

  if (type === "pump") {
    const pumpId = newEventId("pump");
    return {
      id: pumpId,
      dayId,
      eventKey: pumpId,
      type: "pump",
      kind: "block",
      label: "Pump",
      startTime: nowMinutes,
      endTime: nowMinutes + settings.defaultPumpDurationMinutes,
      hasPutdown: false,
      owner: NO_OWNER, // owner required
      lifecycle: projectedLifecycle(),
    };
  }

  if (type === "extra") {
    // Custom events default to instant; formToEvent upgrades to block if the user adds an endTime.
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
      owner: NO_OWNER, // owner required
      lifecycle: projectedLifecycle(),
    };
  }

  // CreatableType is exhaustive; this guards against stray callers passing an unsupported type.
  throw new Error(`buildCreateTemplate: unsupported type ${String(type)}`);
}

/**
 * Next free `<type>_N` slot index, scanning actuals and (when provided) projections.
 * Must scan projections: recorded-only count can collide with an existing cascade slot.
 */
function nextFreeSlot(type: EventType, actuals: Event[], projected?: Event[]): number {
  if (!projected) {
    return actuals.filter((e) => e.type === type && isRecorded(e.lifecycle)).length + 1;
  }
  const re = new RegExp(`^${type}_(\\d+)$`);
  let maxN = 0;
  const scan = (events: Event[]) => {
    for (const e of events) {
      if (e.type !== type) continue;
      const m = re.exec(e.eventKey);
      if (m && m[1]) {
        const n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
      }
    }
  };
  scan(actuals);
  scan(projected);
  return maxN + 1;
}
