/**
 * Augment `React.CSSProperties` to accept CSS custom properties (`--*`).
 *
 * `csstype` has no index signature for arbitrary keys, so without this
 * `style={{ "--owner-color": color }}` fails with TS2353. The index
 * signature is intentionally open — typos like `"--owner-coler"` compile,
 * so verify keys match the consuming CSS rule when a variable has no effect.
 */

import "react";

declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
