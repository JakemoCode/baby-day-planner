import type { Event, EventType, Settings } from "@/domain";

export type CreatableType = "bottle" | "nap" | "pump" | "extra";

export type BuildTemplateInput = {
  type: CreatableType;
  dayId: string;
  actuals: Event[];
  settings: Settings;
  /** Current time as "HH:MM" so the form opens with a sensible default. */
  nowHHMM: string;
};

/**
 * Builds a fully-shaped Event template for the new-event drawer. Names the
 * eventKey using the next sequential N for chained types (`bottle_N`, `nap_N`)
 * so the projection engine can continue forecasting from this anchor.
 */
export function buildCreateTemplate({
  type,
  dayId,
  actuals,
  settings,
  nowHHMM,
}: BuildTemplateInput): Event {
  const idStamp = Date.now();

  if (type === "bottle") {
    const nextN = countByType(actuals, "bottle") + 1;
    return {
      id: `bottle-${idStamp}`,
      dayId,
      eventKey: `bottle_${nextN}`,
      type: "bottle",
      label: `Bottle ${nextN}`,
      startTime: nowHHMM,
      amountOz: settings.defaultBottleAmountOz,
      source: "manual",
      status: "completed",
    };
  }

  if (type === "nap") {
    const nextN = countByType(actuals, "nap") + 1;
    return {
      id: `nap-${idStamp}`,
      dayId,
      eventKey: `nap_${nextN}`,
      type: "nap",
      label: `Nap ${nextN}`,
      startTime: nowHHMM,
      source: "manual",
      status: "completed",
    };
  }

  if (type === "pump") {
    return {
      id: `pump-${idStamp}`,
      dayId,
      eventKey: `pump_${idStamp}`,
      type: "pump",
      label: "Pump",
      startTime: nowHHMM,
      source: "manual",
      status: "completed",
    };
  }

  return {
    id: `extra-${idStamp}`,
    dayId,
    eventKey: `extra_${idStamp}`,
    type: "extra",
    label: "",
    startTime: nowHHMM,
    source: "manual",
    status: "completed",
  };
}

function countByType(events: Event[], type: EventType): number {
  return events.filter((e) => e.type === type).length;
}
