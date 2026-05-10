/**
 * Open `React.CSSProperties` to accept CSS custom properties (`--*`).
 *
 * Background: `csstype` (the package backing `React.CSSProperties`)
 * models the standard CSS spec and has no index signature for arbitrary
 * keys. Without this augmentation, `style={{ "--owner-color": color }}`
 * errors with TS2353 ("Object literal may only specify known properties")
 * and every callsite has to write `as CSSProperties` or
 * `["--owner-color" as string]: color` to force compilation.
 *
 * This declaration adds a typed index signature for any key starting
 * with `--`, which is the entire surface of CSS custom properties.
 * After this augmentation:
 *
 *   style={{ "--owner-color": "#0af" }}      // ✓ no cast required
 *   style={{ "--leader-width": "12px" }}     // ✓ no cast required
 *
 * The value type matches the rest of `CSSProperties`: string, number,
 * or undefined (so React still strips an unset value from the DOM).
 *
 * Note: CSS custom properties are an open namespace, so this index
 * signature cannot catch typos — `"--owner-coler"` compiles. If a
 * variable appears to have no effect, verify the key matches exactly
 * in both the style prop and the consuming CSS rule.
 */

import "react";

declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
