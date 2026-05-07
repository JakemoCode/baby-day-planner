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
  const bottleIndex = (key: string) => {
    const m = /^bottle_(\d+)/.exec(key);
    return m ? Number(m[1]) - 1 : -1;
  };

  return events.map((e) => {
    if (e.owner !== undefined) return e;
    // User-curated events (manual edits or actual recordings) own their
    // owner state. If the user explicitly cleared the owner on one of
    // these, the template must NOT re-stamp it back. Only projected /
    // template-source events get template defaults.
    if (e.source === "manual" || e.source === "actual") return e;
    if (e.type === "nap") {
      const i = napIndex(e.eventKey);
      const o = i >= 0 ? template.napOwners[i] : undefined;
      return o ? { ...e, owner: o } : e;
    }
    if (e.type === "wake_window") {
      // Wake Window N inherits its owner from Nap N — the parent watching
      // during the wake window is the same parent putting baby down for
      // the upcoming nap. Falls back to the legacy wakeWindowOwners array
      // only if napOwners is empty for this index (back-compat).
      const i = wwIndex(e.eventKey);
      const o = i >= 0 ? (template.napOwners[i] ?? template.wakeWindowOwners[i]) : undefined;
      return o ? { ...e, owner: o } : e;
    }
    if (e.type === "putdown") {
      const i = putdownNapIndex(e.eventKey);
      const o = i >= 0 ? template.napOwners[i] : undefined;
      return o ? { ...e, owner: o } : e;
    }
    if (e.type === "bottle") {
      const i = bottleIndex(e.eventKey);
      const o = i >= 0 ? template.bottleOwners?.[i] : undefined;
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
    ...(t.bottleOwners ? { bottleOwners: t.bottleOwners.map(flipOwner) } : {}),
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
