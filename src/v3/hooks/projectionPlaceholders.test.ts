/**
 * Pure type-level assertion that the placeholders match their schemas.
 * Runtime expectations would just re-assert literal values the source
 * already encodes — TypeScript's `satisfies` is a stricter check that
 * costs nothing at runtime.
 */

import { expectTypeOf, it } from "vitest";
import type { Day, Settings } from "../schemas";
import { PLACEHOLDER_DAY, PLACEHOLDER_SETTINGS } from "./projectionPlaceholders";

it("PLACEHOLDER_DAY conforms to Day", () => {
  expectTypeOf(PLACEHOLDER_DAY).toEqualTypeOf<Day>();
});

it("PLACEHOLDER_SETTINGS conforms to Settings", () => {
  expectTypeOf(PLACEHOLDER_SETTINGS).toEqualTypeOf<Settings>();
});
