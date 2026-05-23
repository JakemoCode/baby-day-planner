# §F42 — Input-field font (not programmer-y)

**Source**: Jake, 2026-05-19 — during §F3 welcome click-test. "Fast-follow on the font for input fields — it's too programmer-y."

**Status**: `pending`

**What**: the welcome form's `<input type="text">` / `<input type="date">` / `<input type="time">` fields render in the browser default monospace-ish font (likely inherited from a `body { font-family }` chain that doesn't reach inputs by default). The rest of the app uses a humanist sans (see `tokens.css` / globals.css). Align all `<input>` fonts to the app's body font.

**Likely fix**: one rule in `globals.css` or `tokens.css`:
```css
input, textarea, select, button {
  font-family: inherit;
}
```
Plus visual QA pass on every form (welcome, settings, drawer time picker, day-templates, tomorrow extras).

**Why fast-follow**: pure styling, no behavior change. Bundle with §F2c if §F2c still has visual issues, or its own one-line PR.

**Estimated effort**: 30 minutes + QA sweep.

---


