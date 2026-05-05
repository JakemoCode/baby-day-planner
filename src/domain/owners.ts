import type { Event, Owner, OwnershipTemplate } from "./types";

export function applyTemplate(events: Event[], template: OwnershipTemplate): Event[] {
  const napIndex = (key: string) => {
    const m = /^nap_(\d+)/.exec(key);
    return m ? Number(m[1]) - 1 : -1;
  };
  const wwIndex = (key: string) => {
    const m = /^wake_window_(\d+)/.exec(key);
    return m ? Number(m[1]) - 1 : -1;
  };
  const putdownNapIndex = (key: string) => {
    const m = /^nap_(\d+)_putdown/.exec(key);
    return m ? Number(m[1]) - 1 : -1;
  };

  return events.map((e) => {
    if (e.owner !== undefined) return e;
    if (e.type === "nap") {
      const i = napIndex(e.eventKey);
      const o = i >= 0 ? template.napOwners[i] : undefined;
      return o ? { ...e, owner: o } : e;
    }
    if (e.type === "wake_window") {
      const i = wwIndex(e.eventKey);
      const o = i >= 0 ? template.wakeWindowOwners[i] : undefined;
      return o ? { ...e, owner: o } : e;
    }
    if (e.type === "putdown") {
      const i = putdownNapIndex(e.eventKey);
      const o = i >= 0 ? template.napOwners[i] : undefined;
      return o ? { ...e, owner: o } : e;
    }
    return e;
  });
}

const flipOwner = (o: Owner): Owner => (o === "Jake" ? "Kelly" : o === "Kelly" ? "Jake" : o);

export function flipTemplate(t: OwnershipTemplate): OwnershipTemplate {
  return {
    ...t,
    napOwners: t.napOwners.map(flipOwner),
    wakeWindowOwners: t.wakeWindowOwners.map(flipOwner),
  };
}

export function copyToOtherDay(
  source: OwnershipTemplate,
  newId: string,
  newLabel: string,
): OwnershipTemplate {
  const flipped = flipTemplate(source);
  return { ...flipped, id: newId, label: newLabel };
}
