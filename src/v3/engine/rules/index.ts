/**
 * V3 rules registry.
 *
 * Each domain file exports a `RULES` array; this barrel concatenates them
 * for the evaluator. Adding a new rule = adding it to its domain file (no
 * edits here unless you're adding a whole new domain).
 *
 * Naming policy (per ARCHITECTURE_V3 §2.4):
 *   src/v3/engine/rules/<domain>.ts → exports `RULES: Rule[]`
 *
 * Order is irrelevant; the evaluator topo-sorts by `dependsOn`.
 */

import type { Rule } from "../evaluator";
import { RULES as BOTTLE_RULES } from "./bottles";
import { RULES as DR_RULES } from "./dailyRecurring";
import { RULES as DAYCARE_RULES } from "./daycare";
import { RULES as NAP_RULES } from "./naps";
import { RULES as OWNER_RULES } from "./owners";
import { RULES as PUMP_RULES } from "./pumps";
import { RULES as PUTDOWN_RULES } from "./putdown";
import { RULES as WW_OVERRIDE_RULES } from "./wakeWindowOverrides";

export const ALL_RULES: Rule[] = [
  ...NAP_RULES,
  ...WW_OVERRIDE_RULES,
  ...BOTTLE_RULES,
  ...OWNER_RULES,
  ...DAYCARE_RULES,
  ...PUMP_RULES,
  ...DR_RULES,
  ...PUTDOWN_RULES,
];
