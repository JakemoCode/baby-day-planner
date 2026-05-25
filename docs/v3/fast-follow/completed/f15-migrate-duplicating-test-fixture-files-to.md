# §F15 — Migrate duplicating test fixture files to `aSettings()` factory


All six listed files now consume `aSettings()` — verified by grep against the audit list (`page.test.tsx`, `tomorrow/page.test.tsx`, `day-templates/page.test.tsx`, `TomorrowPreview.test.tsx`, `createEventTemplate.test.ts`, `settings.test.ts`). No standalone PR — landed organically as the engine rewrite progressed.
