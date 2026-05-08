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
import { RULES as NAP_RULES } from "./naps";

export const ALL_RULES: Rule[] = [...NAP_RULES];
