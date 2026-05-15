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

export type CreatableType = "bottle" | "pump" | "extra";

export type BuildTemplateInput = {
  type: CreatableType;
  dayId: string;
  actuals: Event[];
  settings: Settings;
  /** Current time as TimeMin so the form opens with a sensible default. */
  nowMinutes: TimeMin;
  /**
   * Full engine projection for the day (includes engine-emitted
   * `bottle_N` projections). Used to pick the next free slot index
   * when numbering a new bottle so the template-builder agrees with
   * the engine's chronological renumber. Without this, the builder
   * would scan recorded events only and could claim an eventKey
   * already occupied by a projection.
   *
   * Optional for callers that don't have it (rare; only legacy paths).
   * When omitted, falls back to "count of recorded events + 1".
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
      kind: "block",
      label: "Pump",
      startTime: nowMinutes,
      endTime: nowMinutes + settings.defaultPumpDurationMinutes,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
  }

  if (type === "extra") {
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

  // CreatableType is exhaustive (bottle | pump | extra); this throw
  // catches any stray caller passing an unsupported type — most
  // notably a legacy "nap" callsite, removed under the physiology
  // cascade per spec PR #146.
  throw new Error(`buildCreateTemplate: unsupported type ${String(type)}`);
}

/**
 * Compute the next free slot index for `<type>_N` events, scanning
 * BOTH recorded actuals and (when provided) engine projections. The
 * eventKey shape is `${type}_N` (e.g., `nap_3`, `bottle_5`) — we look
 * for the highest existing N and return N+1.
 *
 * Why scan projections too: a manual nap creation inside the bedtime
 * block had no recorded sibling but the cascade had already emitted
 * `nap_1..nap_3`; counting recorded-only would return 1 and the new
 * doc would collide with the projected `nap_1` (§F25).
 *
 * When `projected` is undefined, falls back to "recorded count + 1"
 * for backwards compatibility with callers that don't pass it.
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
