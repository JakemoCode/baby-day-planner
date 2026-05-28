/**
 * `--owner-color` CSS-variable helper. Omits the variable when there's no owner
 * so per-rule CSS fallbacks fire. Companion `data-owner` attr comes from `ownerSlotKey()`.
 */

import type { CSSProperties } from "react";

/** Inline-style object containing only `--owner-color`, or undefined when no color. */
export function ownerStyleVar(color: string | null): CSSProperties | undefined {
  return color ? { "--owner-color": color } : undefined;
}
