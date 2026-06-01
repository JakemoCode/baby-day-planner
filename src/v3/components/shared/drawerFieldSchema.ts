import type { EventType } from "../../schemas";

/** A single editable field in the event drawer. */
export type DrawerField = "label" | "startTime" | "endTime" | "amount" | "volumes" | "owner";

/** A schema entry: one field stacked, or several grouped onto one row. */
export type DrawerFieldRow = DrawerField | { row: DrawerField[] };

/**
 * Per-type field presence + layout for EventEditDrawerV3. Order here is the
 * render order; `{ row: [...] }` lays fields side-by-side (e.g. pump start/end).
 * Field membership replaces the former show-flags; the renderer walks this and
 * emits the matching pre-built field node. Interaction logic (now-buttons,
 * reset/delete policy, locking) is NOT here — it lives with each field node.
 */
export const DRAWER_FIELD_SCHEMA: Record<EventType, DrawerFieldRow[]> = {
  wake_window: ["owner"],
  nap: ["startTime", "endTime", "owner"],
  bottle: ["startTime", "amount", "owner"],
  pump: [{ row: ["startTime", "endTime"] }, "volumes"],
  bedtime: ["startTime", "owner"],
  extra: ["label", "startTime", "endTime", "owner"],
  daily_recurring: ["startTime", "owner"],
  daycare_dropoff: ["startTime", "owner"],
  daycare_pickup: ["startTime", "owner"],
};
