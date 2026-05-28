/**
 * R12.x — Template-driven owner inheritance.
 *
 * Source: docs/v3/ENGINE_SPEC.md §12.
 *
 * Implemented here:
 *   R12.2 — projected naps inherit template.napOwners[N-1]
 *   R12.3 — projected wake_windows inherit template.wakeWindowOwners[N-1]
 *           (NOT from same-index nap; V3 reverses V2)
 *   R12.5 — projected bedtime inherits template.bedtimeOwner
 *   R12.6 — projected bottles inherit template.bottleOwners[N-1] in
 *           chronological order (after R5.4 renumber)
 *
 * Implemented elsewhere (cross-referenced for completeness):
 *   R12.1 — manual/recorded events keep owner: enforced by §0
 *           reality-wins guard in evaluator.ts plus per-rule gating on
 *           `lifecycle.state === "projected"`.
 *   R12.4 — projected putdown owner = parent's owner: structural; render
 *           layer reads it from the parent (hasPutdown flag, R6).
 *   R12.7 — drawer "no owner" omits field: UI / Phase 3.
 *   R12.8 — pump owner = pumpOwnerSlot: handled in pumps.ts (R9).
 *           Dream feed is render-only label now — no owner inheritance.
 *   R12.9 — extras / dailyRecurring carry their own defaults; not template-driven.
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

/**
 * Build a rule that stamps `template.<list>[N-1]` onto projected events of
 * `type` whose `eventKey` is `${keyPrefix}${N}` and whose owner is unset.
 */
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
    // Skip slots that have a Day.ownerOverrides entry (any value, including
    // null = explicit NO_OWNER). R12.10 owns those eventKeys; if template
    // rules also touched them we'd cycle: template stamps default → R12.10
    // re-applies null override → template re-stamps → ...
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
// R12.2 — Naps
// R12.3 — Wake windows (NOT from same-index nap; V3 reverses V2)
// R12.6 — Bottles (chronological, after R5.4 renumber)
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
  // Depend on R5.4 (renumber) so bottle eventKeys are in chronological
  // order before we map index → owner.
  dependsOn: ["R5.4"],
  type: "bottle",
  keyPrefix: "bottle_",
  ownerList: (t) => t.bottleOwners,
});

// ---------------------------------------------------------------------------
// R12.5 — Bedtime (singleton template field, not a list)
// ---------------------------------------------------------------------------

// A projected bedtime is eligible for the template's bedtimeOwner stamp
// only when it has no owner yet AND no per-day ownerOverride claims its
// slot (an explicit override always wins over the template default).
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

/**
 * Parse `${prefix}${N}` → N. Returns null on mismatch.
 *
 * Strict-numeric: `parseInt('1abc', 10)` returns 1, which would let a
 * malformed eventKey like `nap_1abc` silently map to napOwners[0]. We
 * require the suffix to be all digits.
 */
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
// R12.10 — Day.ownerOverrides (§F12 + §F17, see docs/v3/F17_F12_SCOPE.md §4)
// ---------------------------------------------------------------------------

/**
 * Beats all template-driven owner inheritance for matching eventKeys.
 * `null` in the map = explicit NO_OWNER (the user un-assigned a slot
 * that would otherwise default to an owner). Missing key = no override.
 *
 * dependsOn includes all R12.x template rules so this rule runs after
 * them and is the final say on projected-event ownership.
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
