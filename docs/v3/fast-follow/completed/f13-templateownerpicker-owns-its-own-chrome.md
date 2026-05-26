# §F13 — TemplateOwnerPicker owns its own chrome


Shipped in **PR #175** (`feat/template-owner-picker-chrome`).
`TemplateOwnerPicker` gained `onCancel` + a title slot; DayTemplates
page dropped its `.pickerWrap` / `.pickerHeader` / `.pickerLabel` /
`.pickerCancel` workaround. Companion refactor extracted `BottomSheet`
from `FABTypePicker` so the picker reuses it.
