"use client";

import { useEffect, useId, useState } from "react";
import type { Event, EventType, Owner } from "@/domain";
import { formatTime, formatTimeForDisplay, parseTime } from "@/domain";
import { ConfirmDialog } from "./ConfirmDialog";
import { OwnerPicker } from "./OwnerPicker";
import styles from "./EventEditDrawer.module.css";

export type EventEditDrawerMode = "edit" | "create";

export type EventEditDrawerProps = {
  open: boolean;
  mode: EventEditDrawerMode;
  /** The event being edited (mode="edit") or the seeded template to create (mode="create"). */
  event: Event | null;
  onSave: (event: Event) => void | Promise<void>;
  onCancel: () => void;
  onDelete?: (event: Event) => void | Promise<void>;
  /**
   * Other events in the day, used to validate against time-overlap conflicts
   * (e.g. a new Nap 2 inserted inside an existing Nap 3). Excludes the
   * event being edited via id match. Optional — when omitted, only the
   * basic end>start check runs.
   */
  existingEvents?: Event[];
};

/**
 * Field-level validation errors. Returned as a partial map of field →
 * message so the drawer can render the message inline as helper text on
 * the offending input rather than at the bottom of the form.
 */
type FormErrors = { startTime?: string; endTime?: string };

function validateForm(
  type: EventType,
  startTime: string,
  endTime: string,
  editingId: string | undefined,
  existingEvents: Event[] | undefined,
): FormErrors {
  const errors: FormErrors = {};
  if (endTime && startTime) {
    if (parseTime(endTime) <= parseTime(startTime)) {
      errors.endTime = "Must be after start time.";
    }
  }
  if (!errors.endTime && type === "nap" && endTime && existingEvents) {
    const start = parseTime(startTime);
    const end = parseTime(endTime);
    // Only flag overlap against RECORDED naps. Projected and unrecorded
    // annotations get freely recalculated by the engine after save.
    const overlap = existingEvents.find((e) => {
      if (e.id === editingId) return false;
      if (e.type !== "nap") return false;
      if (!e.endTime) return false;
      if (!e.recorded) return false;
      const a = parseTime(e.startTime);
      const b = parseTime(e.endTime);
      return a < end && start < b;
    });
    if (overlap) {
      const startStr = formatTimeForDisplay(overlap.startTime);
      const endStr = overlap.endTime ? formatTimeForDisplay(overlap.endTime) : "";
      errors.endTime = `Overlaps ${overlap.label} (${startStr} – ${endStr}).`;
    }
  }
  return errors;
}

const hasErrors = (e: FormErrors) => !!(e.startTime || e.endTime);

type FormState = {
  startTime: string;
  endTime: string;
  amountOz: string;
  owner: Owner | undefined;
  label: string;
};

function eventToForm(event: Event | null): FormState {
  return {
    startTime: event?.startTime ?? "",
    endTime: event?.endTime ?? "",
    amountOz: event?.amountOz != null ? String(event.amountOz) : "",
    owner: event?.owner,
    label: event?.label ?? "",
  };
}

function formToEvent(form: FormState, source: Event, type: EventType): Event {
  // Recording = the user committed a specific time for this event.
  // Owner-only edits on a not-yet-happened event are annotations: they
  // persist owner via a manual doc, but `recorded: false` keeps the
  // engine free to recalculate time around real recordings before it.
  const startTimeChanged = source.startTime !== form.startTime;
  const endTimeChanged = (source.endTime ?? "") !== form.endTime;
  const timeChanged = startTimeChanged || endTimeChanged;
  // Once recorded, always recorded (owner-only re-edit can't un-record).
  const recorded = source.recorded || timeChanged;
  const nextStatus =
    source.status === "projected" ? (recorded ? "completed" : "overridden") : source.status;

  const next: Event = {
    ...source,
    type,
    startTime: form.startTime,
    label: form.label || source.label,
    source: source.source === "projected" ? "manual" : source.source,
    status: nextStatus,
    recorded,
  };

  if (form.endTime) {
    next.endTime = form.endTime;
  } else {
    delete (next as { endTime?: string }).endTime;
  }

  if (form.amountOz) {
    const oz = Number(form.amountOz);
    if (Number.isFinite(oz)) next.amountOz = oz;
  }

  if (form.owner) {
    next.owner = form.owner;
  } else {
    delete (next as { owner?: Owner }).owner;
  }

  return next;
}

const EDIT_TITLE_BY_TYPE: Record<EventType, string> = {
  wake: "Edit wake",
  wake_window: "Edit wake window",
  putdown: "Edit putdown",
  nap: "Edit nap",
  bottle: "Edit bottle",
  pump: "Edit pump",
  bedtime: "Edit bedtime",
  dream_feed: "Edit dream feed",
  extra: "Edit event",
};

const CREATE_TITLE_BY_TYPE: Partial<Record<EventType, string>> = {
  bottle: "Add bottle",
  nap: "Add nap",
  pump: "Add pump",
  extra: "Add event",
};

export function EventEditDrawer({
  open,
  mode,
  event,
  onSave,
  onCancel,
  onDelete,
  existingEvents,
}: EventEditDrawerProps) {
  const sourceEvent = event;
  const [form, setForm] = useState<FormState>(() => eventToForm(sourceEvent));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const titleId = useId();

  // Form state is derived from the source event on first render only.
  // To force a fresh form when the event changes, parents should pass
  // `<EventEditDrawer key={...} … />` so React remounts the component
  // (cleaner than syncing state inside an effect).

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;
  if (!sourceEvent) return null;

  const type = sourceEvent.type;
  const title =
    mode === "create" ? (CREATE_TITLE_BY_TYPE[type] ?? "Add event") : EDIT_TITLE_BY_TYPE[type];
  const canDelete =
    mode === "edit" &&
    onDelete !== undefined &&
    (sourceEvent.source === "actual" || sourceEvent.source === "manual");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const showStartTime = type !== "wake_window";
  const showEndTime = type === "nap" || type === "extra";

  const errors = validateForm(type, form.startTime, form.endTime, sourceEvent?.id, existingEvents);

  // When the user changes startTime on a duration block, slide endTime
  // forward to preserve the existing duration (or default to 60 min if
  // we don't have an existing duration to learn from). Saves the user
  // from re-entering the end time every time they tweak the start.
  const NAP_DEFAULT_MINUTES = 60;
  const handleStartTimeChange = (nextStart: string) => {
    if (!showEndTime || !nextStart) {
      set("startTime", nextStart);
      return;
    }
    const startMin = parseTime(nextStart);
    let durMin = NAP_DEFAULT_MINUTES;
    if (form.startTime && form.endTime) {
      const prevDur = parseTime(form.endTime) - parseTime(form.startTime);
      if (prevDur > 0) durMin = prevDur;
    }
    const nextEnd = formatTime(startMin + durMin);
    setForm((prev) => ({ ...prev, startTime: nextStart, endTime: nextEnd }));
  };
  const showAmount = type === "bottle" || type === "dream_feed";
  const showOwner =
    type === "nap" ||
    type === "wake_window" ||
    type === "bottle" ||
    type === "extra" ||
    type === "bedtime" ||
    type === "dream_feed";
  const showLabel = type === "extra";

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.drawer}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.handle} aria-hidden="true" />
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>

        {showLabel && (
          <label className={styles.field}>
            <span className={styles.label}>Label</span>
            <input
              type="text"
              className={styles.input}
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="Pediatrician, library trip…"
            />
          </label>
        )}

        {showStartTime && (
          <label className={styles.field}>
            <span className={styles.label}>Start time</span>
            <input
              type="time"
              className={styles.input}
              value={form.startTime}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              required
              {...(errors.startTime ? { "aria-invalid": true } : {})}
            />
            {errors.startTime && (
              <span className={styles.fieldError} role="alert">
                {errors.startTime}
              </span>
            )}
          </label>
        )}

        {showEndTime && (
          <label className={styles.field}>
            <span className={styles.label}>End time</span>
            <input
              type="time"
              className={styles.input}
              value={form.endTime}
              onChange={(e) => set("endTime", e.target.value)}
              {...(errors.endTime ? { "aria-invalid": true } : {})}
            />
            {errors.endTime && (
              <span className={styles.fieldError} role="alert">
                {errors.endTime}
              </span>
            )}
          </label>
        )}

        {showAmount && (
          <label className={styles.field}>
            <span className={styles.label}>Amount (oz)</span>
            <input
              type="number"
              step="0.5"
              min="0"
              className={styles.input}
              value={form.amountOz}
              onChange={(e) => set("amountOz", e.target.value)}
            />
          </label>
        )}

        {showOwner && (
          <OwnerPicker label="Owner" value={form.owner} onChange={(next) => set("owner", next)} />
        )}

        <div className={styles.actions}>
          {canDelete && (
            <button type="button" className={styles.delete} onClick={() => setConfirmOpen(true)}>
              Delete
            </button>
          )}
          <button type="button" className={styles.cancel} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.save}
            disabled={hasErrors(errors)}
            onClick={() => {
              if (hasErrors(errors)) return;
              const next = formToEvent(form, sourceEvent, type);
              void onSave(next);
            }}
          >
            Save
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete this ${type === "extra" ? "event" : type.replace("_", " ")}?`}
        body="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Keep"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          if (sourceEvent && onDelete) void onDelete(sourceEvent);
        }}
      />
    </div>
  );
}
