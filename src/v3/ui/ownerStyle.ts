/**
 * Shared owner-rendering attributes.
 *
 * Components that visually identify an owner need two coupled pieces:
 *   - `data-owner` attribute (slot key) so existing CSS selectors apply
 *   - `--owner-color` CSS custom property scoped to the element
 *
 * Each piece is conditional on the owner being set, but they MUST stay
 * in sync — the CSS rules that read `--owner-color` are gated on
 * `[data-owner]`. Centralising the spread shape here removes the
 * three independent open-codings + casts that lived in Block.tsx,
 * InstantChip.tsx, and OwnerPickerV3.tsx.
 *
 * Returns an object suitable for spreading onto an element. Callers
 * that need to merge `style` with positioning vars can use
 * `ownerStyleVar(color)` directly.
 */

import type { OwnerRef, OwnersConfig } from "../schemas";
import { ownerSlotKey } from "../components/Timeline/ownerSlotKey";
import { ownerColor } from "./owners";

export type OwnerAttrs = {
  "data-owner"?: string;
  style?: React.CSSProperties;
};

/** Inline-style object containing only `--owner-color`, or undefined when no color.
 * The `as React.CSSProperties` cast is required: `csstype`'s Properties has no
 * index signature for `--*` custom properties, so the literal must be cast.
 * (Verified: dropping the cast errors TS2353. §1.4 removed the redundant inner
 * `["--owner-color" as string]` index cast but the outer one stays.) */
export function ownerStyleVar(color: string | null): React.CSSProperties | undefined {
  return color ? ({ "--owner-color": color } as React.CSSProperties) : undefined;
}

/** All the spreadable attributes a tinted owner element needs. */
export function ownerAttrs(ref: OwnerRef | undefined, owners: OwnersConfig): OwnerAttrs {
  const slotKey = ownerSlotKey(ref);
  const style = ownerStyleVar(ownerColor(ref, owners));
  const out: OwnerAttrs = {};
  if (slotKey) out["data-owner"] = slotKey;
  if (style) out.style = style;
  return out;
}
