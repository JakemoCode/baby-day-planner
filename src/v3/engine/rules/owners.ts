/**
 * R12.x — Template-driven owner inheritance.
 *
 * Source: docs/v3/REQUIREMENTS.md §12.
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
 *           Dream feed = opposite of bedtime owner: handled in dreamFeed.ts (R8).
 *   R12.9 — extras / dailyRecurring carry their own defaults; not template-driven.
 */

import type { Event, OwnerSlotEntry, OwnershipTemplate } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, isProjected } from "../helpers";

const isBedtime = hasType("bedtime");

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

  function isStampable(event: Event): boolean {
    return isType(event) && isProjected(event) && event.owner === undefined;
  }

  return {
    id: spec.id,
    description: spec.description,
    dependsOn: spec.dependsOn,
    matches: (events, ctx) => {
      const owners = ownersFor(ctx.template);
      if (!owners) return false;
      return events.some((e) => {
        if (!isStampable(e)) return false;
        const idx = indexFromKey(e.eventKey, spec.keyPrefix);
        return idx !== null && idx <= owners.length;
      });
    },
    produces: (events, ctx) => {
      const owners = ownersFor(ctx.template);
      if (!owners) return events;
      return events.map((e) => {
        if (!isStampable(e)) return e;
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

const RuleApplyTemplateBedtimeOwner: Rule = {
  id: "R12.5",
  description: "Stamp template.bedtimeOwner onto a projected bedtime that has no owner",
  dependsOn: ["R7.6"],
  matches: (events, ctx) => {
    if (!ctx.template?.bedtimeOwner) return false;
    return events.some((e) => isBedtime(e) && isProjected(e) && e.owner === undefined);
  },
  produces: (events, ctx) => {
    const owner = ctx.template?.bedtimeOwner;
    if (!owner) return events;
    return events.map((e) =>
      isBedtime(e) && isProjected(e) && e.owner === undefined ? { ...e, owner } : e,
    );
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

export const RULES: Rule[] = [
  RuleApplyTemplateNapOwners,
  RuleApplyTemplateWakeWindowOwners,
  RuleApplyTemplateBedtimeOwner,
  RuleApplyTemplateBottleOwners,
];
