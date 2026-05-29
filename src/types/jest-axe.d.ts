// jest-axe ships matcher types for jest's `expect`; Vitest's `expect` needs
// the same `toHaveNoViolations` augmentation wired explicitly. Declaration
// merging requires empty interfaces that extend the matcher set, so the
// no-empty-object-type rule is deliberately off for this file.
/* eslint-disable @typescript-eslint/no-empty-object-type */
import "vitest";
import type { AxeMatchers } from "jest-axe";

declare module "vitest" {
  interface Assertion<_T = unknown> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
