/**
 * R12.2/3/5/6/10 — Template-driven and per-day owner inheritance for
 * projected naps, wake_windows, bedtime, and bottles. R12.10 applies
 * Day.ownerOverrides last, beating template defaults.
 */

import {
  isNoOwner,
  NO_OWNER,
  type Event,
  type OwnerRef,
  type OwnerSlotEntry,
  type OwnershipTemplate,
} from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, isBedtime, isProjected } from "../helpers";

/** Build a rule that stamps template owner[N-1] onto projected events of the given type. */
function templateOwnerByIndexRule(spec: {
  id: string;
  description: string;
  dependsOn: string[];
  type: Event["type"];
  keyPrefix: string;
  ownerList: (t: OwnershipTemplate) => OwnerSlotEntry[] | undefined;
}): Rule {
  const isType = hasType(spec.type);

  function ownersFor(template: OwnershipTemplate | undefined): OwnerSlotEntry[] | undefined {
    if (!template) return undefined;
    const list = spec.ownerList(template);
    return list && list.length > 0 ? list : undefined;
  }

  function isStampable(event: Event, overrides: Record<string, unknown> | undefined): boolean {
    // Skip eventKeys claimed by R12.10 (any value, including null) to avoid stamp→override→stamp cycles.
    if (overrides && Object.hasOwn(overrides, event.eventKey)) return false;
    return isType(event) && isProjected(event) && isNoOwner(event.owner);
  }

  return {
    id: spec.id,
    description: spec.description,
    dependsOn: spec.dependsOn,
    matches: (events, ctx) => {
      const owners = ownersFor(ctx.template);
      if (!owners) return false;
      const overrides = ctx.day.ownerOverrides;
      return events.some((e) => {
        if (!isStampable(e, overrides)) return false;
        const idx = indexFromKey(e.eventKey, spec.keyPrefix);
        return idx !== null && idx <= owners.length;
      });
    },
    produces: (events, ctx) => {
      const owners = ownersFor(ctx.template);
      if (!owners) return events;
      const overrides = ctx.day.ownerOverrides;
      return events.map((e) => {
        if (!isStampable(e, overrides)) return e;
        const idx = indexFromKey(e.eventKey, spec.keyPrefix);
        if (idx === null) return e;
        const owner = owners[idx - 1];
        return owner ? { ...e, owner } : e;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// R12.2 / R12.3 / R12.6 — Naps, wake_windows (V3 reverses V2 indexing), bottles
// ---------------------------------------------------------------------------

const RuleApplyTemplateNapOwners = templateOwnerByIndexRule({
  id: "R12.2",
  description: "Stamp template.napOwners[N-1] onto projected naps that have no owner",
  dependsOn: ["R3.1"],
  type: "nap",
  keyPrefix: "nap_",
  ownerList: (t) => t.napOwners,
});

const RuleApplyTemplateWakeWindowOwners = templateOwnerByIndexRule({
  id: "R12.3",
  description: "Stamp template.wakeWindowOwners[N-1] onto projected wake_windows",
  dependsOn: ["R3.1"],
  type: "wake_window",
  keyPrefix: "wake_window_",
  ownerList: (t) => t.wakeWindowOwners,
});

const RuleApplyTemplateBottleOwners = templateOwnerByIndexRule({
  id: "R12.6",
  description: "Stamp template.bottleOwners[N-1] onto projected bottles in chronological order",
  dependsOn: ["R5.4"], // R5.4 must renumber before index→owner mapping
  type: "bottle",
  keyPrefix: "bottle_",
  ownerList: (t) => t.bottleOwners,
});

// ---------------------------------------------------------------------------
// R12.5 — Bedtime
// ---------------------------------------------------------------------------

// Eligible only when no owner set and no per-day ownerOverride claims the slot.
function isStampableBedtime(
  e: Event,
  overrides: Record<string, OwnerRef | null> | undefined,
): boolean {
  return (
    isBedtime(e) &&
    isProjected(e) &&
    isNoOwner(e.owner) &&
    !(overrides && Object.hasOwn(overrides, e.eventKey))
  );
}

const RuleApplyTemplateBedtimeOwner: Rule = {
  id: "R12.5",
  description: "Stamp template.bedtimeOwner onto a projected bedtime that has no owner",
  dependsOn: ["R3.1"],
  matches: (events, ctx) => {
    if (!ctx.template?.bedtimeOwner) return false;
    return events.some((e) => isStampableBedtime(e, ctx.day.ownerOverrides));
  },
  produces: (events, ctx) => {
    const owner = ctx.template?.bedtimeOwner;
    if (!owner) return events;
    return events.map((e) => (isStampableBedtime(e, ctx.day.ownerOverrides) ? { ...e, owner } : e));
  },
};

/** Parse `${prefix}${N}` → N; strict-numeric suffix (guards against `nap_1abc` → napOwners[0]). */
const DIGIT_SUFFIX = /^\d+$/;
function indexFromKey(eventKey: string, keyPrefix: string): number | null {
  if (!eventKey.startsWith(keyPrefix)) return null;
  const suffix = eventKey.slice(keyPrefix.length);
  if (!DIGIT_SUFFIX.test(suffix)) return null;
  const n = Number(suffix);
  if (n < 1) return null;
  return n;
}

// ---------------------------------------------------------------------------
// R12.10 — Day.ownerOverrides
// ---------------------------------------------------------------------------

/**
 * Applies Day.ownerOverrides to projected events; beats all template rules.
 * null = explicit NO_OWNER; missing key = no override.
 */
const RuleApplyDayOwnerOverrides: Rule = {
  id: "R12.10",
  description: "Apply Day.ownerOverrides to projected events (beats template defaults)",
  dependsOn: ["R12.2", "R12.3", "R12.5", "R12.6"],
  matches: (events, ctx) => {
    const map = ctx.day.ownerOverrides;
    if (!map) return false;
    return events.some((e) => isProjected(e) && Object.hasOwn(map, e.eventKey));
  },
  produces: (events, ctx) => {
    const map = ctx.day.ownerOverrides;
    if (!map) return events;
    return events.map((e) => {
      if (!isProjected(e)) return e;
      if (!Object.hasOwn(map, e.eventKey)) return e;
      const override = map[e.eventKey];
      return { ...e, owner: override ?? NO_OWNER };
    });
  },
};

export const RULES: Rule[] = [
  RuleApplyTemplateNapOwners,
  RuleApplyTemplateWakeWindowOwners,
  RuleApplyTemplateBedtimeOwner,
  RuleApplyTemplateBottleOwners,
  RuleApplyDayOwnerOverrides,
];
