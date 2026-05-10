/**
 * Owner-color CSS-variable helper.
 *
 * Components that visually identify an owner set the `--owner-color`
 * CSS custom property scoped to the element. This helper centralises
 * the conditional shape (omit the variable entirely when there is no
 * owner, so per-rule CSS fallbacks fire) and one canonical pattern.
 *
 * The `--*` augmentation in `src/types/react-css.d.ts` removes any
 * cast requirement; this helper exists to avoid repeating the literal
 * variable name `--owner-color` and the omit-when-null shape at every
 * call site.
 *
 * Companion attribute `data-owner` is set independently via
 * `ownerSlotKey()` — components conditionally spread it next to
 * `style={ownerStyleVar(...)}`.
 */

import type { CSSProperties } from "react";

/** Inline-style object containing only `--owner-color`, or undefined when no color. */
export function ownerStyleVar(color: string | null): CSSProperties | undefined {
  return color ? { "--owner-color": color } : undefined;
}
