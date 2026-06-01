// A11y test coverage gate (CI). Invariant: every client component under
// src/**/components/** has a sibling `<Name>.a11y.test.tsx` rendering it and
// asserting axe finds no structural violations.
//
// Scope is "use client" components only — server/logic/skeleton files can't
// render meaningfully in jsdom, so requiring axe tests for them would be noise.
// A component that legitimately needs no a11y test opts out with a marker:
//
//     // a11y-exempt: <reason>
//
// Enforces EXISTENCE, not freshness — a gate can't tell a real test update
// from a whitespace touch. Keeping a test current when its component changes
// is a convention + review-loop concern (see AGENTS.md).

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const ROOT = "src";

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...walk(full));
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const isTest = (f) => f.endsWith(".test.tsx");
const inComponents = (f) => f.split("/").includes("components");
// "use client" must be a directive line near the top, but a leading banner
// comment can legally precede it — scan the first several lines, not just char 0.
const isClient = (src) =>
  /^\s*["']use client["'];?\s*$/m.test(src.split("\n").slice(0, 6).join("\n"));
// Marker must be its own comment line with a non-empty reason, so an incidental
// mention of "a11y-exempt:" elsewhere can't silently disable the gate.
const isExempt = (src) => /^\s*\/\/\s*a11y-exempt:\s*\S/m.test(src);

const missing = [];
let checked = 0;

for (const file of walk(ROOT)) {
  if (isTest(file) || !inComponents(file)) continue;
  const src = readFileSync(file, "utf8");
  if (!isClient(src) || isExempt(src)) continue;
  checked += 1;
  const sibling = join(dirname(file), `${basename(file, ".tsx")}.a11y.test.tsx`);
  if (!existsSync(sibling)) missing.push({ file, sibling });
}

if (missing.length > 0) {
  console.error(
    `\n✖ A11y coverage gate: ${missing.length} client component(s) missing an a11y test:\n`,
  );
  for (const { file, sibling } of missing) {
    console.error(`  ${file}`);
    console.error(
      `    → add ${sibling}, or add a "// a11y-exempt: <reason>" comment to the component.\n`,
    );
  }
  console.error(
    "Add a *.a11y.test.tsx that renders the component in its visible state and asserts\n" +
      "`expect(await axe(container)).toHaveNoViolations()` (helpers in src/test-utils.tsx).\n",
  );
  process.exit(1);
}

console.log(`✓ A11y coverage gate: ${checked} client components, all have a11y tests.`);
