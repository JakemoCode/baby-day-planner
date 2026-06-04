# Next.js notes

Gotchas specific to this app's Next.js version. See also `AGENTS.md`
("This is NOT the Next.js you know").

## "use client" function-prop warnings are false positives (do not "fix")

**Symptom (editor only).** The Next TS plugin marks function props on
many `"use client"` components:

> Props must be serializable for components in the "use client" entry
> file. "onSave" is a function that's not a Server Action. Rename
> "onSave" … to end with "Action" … (diagnostic `71007`)

Seen on `EventEditDrawerV3`, `ContextualActionButton`, `useDrawer`,
and ~18 other client components that take callback props.

**Why it's noise.** The plugin treats every `"use client"` file as a
server→client boundary "entry" and flags function props regardless of
the importer. In this app those components are rendered **only by other
client components** (the route `page.tsx` files are themselves
`"use client"`), so the props never cross the RSC serialization
boundary — there is nothing unserializable.

**It does not reach CI.** `tsc --noEmit`, `next build`, and `eslint`
are all clean. The warning exists solely in the editor via the
`{ "name": "next" }` TS language-service plugin.

**Why we don't suppress it.**
- TS language-service plugin diagnostics ignore `// @ts-ignore` /
  `// @ts-expect-error` (those only suppress core-TS errors), and the
  Next plugin exposes no per-diagnostic toggle.
- Renaming client callbacks to `*Action` would falsely imply Server
  Actions — misleading, and it would have to touch every client
  component to stay consistent.
- Dropping `{ "name": "next" }` from `tsconfig.json` would also remove
  the plugin's real value (typed routes, genuine server/client checks).

**Decision:** accept them. If a future Next release adds a granular
suppression or fixes the importer heuristic, revisit. (2026-06-03)
