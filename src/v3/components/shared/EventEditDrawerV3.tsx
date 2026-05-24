"use client";

import { useEffect, useId, useState } from "react";
import styles from "./EventEditDrawer.module.css";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { Event, EventType, OwnerRef, OwnersConfig, TimeMin } from "../../schemas";
import { isRecorded, NO_OWNER } from "../../schemas";
import { formatHM24, formatTimeForDisplay, nextDayAt, parseHM24 } from "../../ui/time";
import { OwnerPickerV3 } from "./OwnerPickerV3";
import { formToEvent, type FormState } from "./formToEvent";

export type EventEditDrawerV3Mode = "edit" | "create";

export type EventEditDrawerV3Props = {
  open: boolean;
  mode: EventEditDrawerV3Mode;
  event: Event | null;
  owners: OwnersConfig;
  /** Current time as TimeMin; stamps lifecycle.committedAt / annotatedAt at save. */
  nowMinutes: TimeMin;
  /**
   * Settings.bedtimeThreshold — drives the "Change to bedtime?" prompt
   * when a nap edit moves startTime from below to at/after threshold.
   * Per spec PR #146 R2 (physiology cascade).
   */
  bedtimeThreshold: TimeMin;
  /**
   * Settings.defaultWakeTime — used to compute the bedtime block's
   * endTime when a nap is converted to bedtime via the past-threshold
   * prompt. Per DOMAIN.md §3, bedtime extends to the next morning's
   * wake (defaultWakeTime + 24h), NOT the source nap's endTime.
   */
  defaultWakeTime: TimeMin;
  onSave: (event: Event) => void | Promise<void>;
  onCancel: () => void;
  onDelete?: (event: Event) => void | Promise<void>;
  /**
   * Other events on the same day, used for overlap validation. Excludes
   * the event being edited via id match. Only RECORDED neighbours flag
   * an overlap — projected ones get freely recalculated by the engine.
   */
  existingEvents?: Event[];
};

type FormErrors = { startTime?: string; endTime?: string };

function validateForm(
  type: EventType,
  startTime: TimeMin | undefined,
  endTime: TimeMin | undefined,
  editingId: string | undefined,
  existingEvents: Event[] | undefined,
): FormErrors {
  const errors: FormErrors = {};
  if (endTime !== undefined && startTime !== undefined && endTime <= startTime) {
    errors.endTime = "Must be after start time.";
  }
  if (
    !errors.endTime &&
    type === "nap" &&
    endTime !== undefined &&
    startTime !== undefined &&
    existingEvents
  ) {
    const overlap = existingEvents.find((e) => {
      if (e.id === editingId) return false;
      if (e.type !== "nap") return false;
      if (e.endTime === undefined) return false;
      if (!isRecorded(e.lifecycle)) return false;
      return e.startTime < endTime && startTime < e.endTime;
    });
    if (overlap && overlap.endTime !== undefined) {
      const startStr = formatTimeForDisplay(overlap.startTime);
      const endStr = formatTimeForDisplay(overlap.endTime);
      errors.endTime = `Overlaps ${overlap.label} (${startStr} – ${endStr}).`;
    }
  }
  return errors;
}

const hasErrors = (e: FormErrors) => !!(e.startTime || e.endTime);

const EDIT_TITLE_BY_TYPE: Record<EventType, string> = {
  wake_window: "Edit wake window",
  nap: "Edit nap",
  bottle: "Edit bottle",
  pump: "Edit pump",
  bedtime: "Edit bedtime",
  extra: "Edit event",
  daily_recurring: "Edit recurring event",
  daycare_dropoff: "Edit daycare dropoff",
  daycare_pickup: "Edit daycare pickup",
};

const CREATE_TITLE_BY_TYPE: Partial<Record<EventType, string>> = {
  bottle: "Add bottle",
  nap: "Add nap",
  pump: "Add pump",
  extra: "Add event",
};

const NAP_DEFAULT_MINUTES = 60;

const OWNER_TYPES: ReadonlySet<EventType> = new Set([
  "nap",
  "wake_window",
  "bottle",
  "extra",
  "bedtime",
  "daycare_dropoff",
  "daycare_pickup",
]);

type InternalForm = {
  startTime: TimeMin | undefined;
  endTime: TimeMin | undefined;
  amountOz: number | undefined;
  owner: OwnerRef; // §F37: always defined; NO_OWNER for unassigned
  label: string;
};

function eventToForm(event: Event | null): InternalForm {
  return {
    startTime: event?.startTime,
    endTime: event?.endTime,
    amountOz: event?.amountOz,
    owner: event?.owner ?? NO_OWNER,
    label: event?.label ?? "",
  };
}

function timeInputValue(t: TimeMin | undefined): string {
  return t === undefined ? "" : formatHM24(t);
}

export function EventEditDrawerV3({
  open,
  mode,
  event,
  owners,
  nowMinutes,
  bedtimeThreshold,
  defaultWakeTime,
  onSave,
  onCancel,
  onDelete,
  existingEvents,
}: EventEditDrawerV3Props) {
  const sourceEvent = event;
  const [form, setForm] = useState<InternalForm>(() => eventToForm(sourceEvent));
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Past-threshold prompt: when a nap edit crosses bedtimeThreshold,
  // hold the would-be saved Event here pending the parent's "Change to
  // bedtime?" decision. Yes → delete original (if recorded) + save a
  // bedtime doc; No → save the held nap as-is. Per spec PR #146 R2.
  const [pendingPastThresholdNap, setPendingPastThresholdNap] = useState<Event | null>(null);
  const titleId = useId();

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
  const baseTitle =
    mode === "create" ? (CREATE_TITLE_BY_TYPE[type] ?? "Add event") : EDIT_TITLE_BY_TYPE[type];
  // §F56: bake the human label into the heading so "Edit recurring event" names which one.
  const title =
    mode === "edit" && type === "daily_recurring" && sourceEvent.label
      ? `${baseTitle}: ${sourceEvent.label}`
      : baseTitle;

  // Delete is meaningful for events that exist in Firestore (already-
  // recorded) OR for daily_recurring events — for recurring, "delete"
  // means "skip today" via Day.suppressedRecurringIds (§F65), not a
  // Firestore doc delete. useDrawer routes both cases.
  const canDelete =
    mode === "edit" &&
    onDelete !== undefined &&
    (isRecorded(sourceEvent.lifecycle) || type === "daily_recurring");

  const confirmCopy =
    type === "daily_recurring"
      ? {
          title: `Skip ${sourceEvent.label} today?`,
          body: "It'll come back tomorrow.",
          confirmLabel: "Skip today",
        }
      : {
          title: `Delete this ${type === "extra" ? "event" : type.replace("_", " ")}?`,
          body: "This cannot be undone.",
          confirmLabel: "Delete",
        };

  const showStartTime = type !== "wake_window";
  const showEndTime = type === "nap" || type === "extra" || type === "pump";
  const showAmount = type === "bottle";
  const showOwner = OWNER_TYPES.has(type);
  const showLabel = type === "extra";

  const errors = validateForm(type, form.startTime, form.endTime, sourceEvent.id, existingEvents);

  const handleStartTimeChange = (raw: string) => {
    const next = parseHM24(raw);
    // Naps and pumps preserve their start→end duration as the user
    // nudges startTime — both imply a duration baked into their
    // template (nap default length, pump default duration). Extras
    // decide instant-vs-block at save based on whether the user
    // explicitly entered an endTime, so we DON'T auto-fill endTime
    // from a startTime change for extras.
    const preservesDuration = type === "nap" || type === "pump";
    if (!preservesDuration || next === undefined) {
      setForm((prev) => ({ ...prev, startTime: next }));
      return;
    }
    let durMin = NAP_DEFAULT_MINUTES;
    if (form.startTime !== undefined && form.endTime !== undefined) {
      const prevDur = form.endTime - form.startTime;
      if (prevDur > 0) durMin = prevDur;
    }
    setForm((prev) => ({ ...prev, startTime: next, endTime: next + durMin }));
  };

  const handleSave = () => {
    if (hasErrors(errors)) return;
    if (form.startTime === undefined) return;
    const formForTransform: FormState = {
      startTime: form.startTime,
      endTime: form.endTime,
      amountOz: form.amountOz,
      owner: form.owner,
      label: form.label,
    };
    const next = formToEvent(formForTransform, sourceEvent, nowMinutes);

    // Prompt trigger: a nap whose startTime crossed from below
    // threshold to at/after threshold during this edit (spec R2 / Q6).
    // Owner-only edits on already-late naps don't re-prompt; back-edits
    // from past-threshold to within-threshold don't prompt either.
    const crossedThreshold =
      next.type === "nap" &&
      sourceEvent.startTime < bedtimeThreshold &&
      next.startTime >= bedtimeThreshold;

    if (crossedThreshold) {
      setPendingPastThresholdNap(next);
      return;
    }

    void onSave(next);
  };

  const handleConfirmChangeToBedtime = async () => {
    if (!pendingPastThresholdNap) return;
    const napCandidate = pendingPastThresholdNap;
    setPendingPastThresholdNap(null);
    // Per DOMAIN.md §3: bedtime IS the day's last sleep. Its endTime
    // is the next morning's wake (defaultWakeTime + 24h), NOT the
    // source nap's endTime — the nap's recorded endTime represents
    // a within-day sleep, but bedtime extends through the night.
    // Lifecycle is `recorded` (user is anchoring bedtime in reality;
    // "in progress" is a time property, not a lifecycle state).
    const bedtimeBase: Event = {
      // §F59: align id convention with useDrawer (`recorded_${eventKey}`)
      // so this and any subsequent edit / Start-Bedtime tap write to the
      // same Firestore doc instead of orphaning a `bedtime`-id doc.
      id: "recorded_bedtime",
      dayId: napCandidate.dayId,
      eventKey: "bedtime",
      type: "bedtime",
      kind: "block",
      label: "Bedtime",
      startTime: napCandidate.startTime,
      endTime: nextDayAt(defaultWakeTime),
      hasPutdown: false,
      // `recorded`: putdown.ts derives hasPutdown from {projected, recorded}.
      // Cascade's manualBedtime check is `!isProjected`, so `recorded`
      // remains authoritative and matches the drawer-edit shape.
      owner: napCandidate.owner, // §F37: owner is required (NO_OWNER if unassigned)
      lifecycle: { state: "recorded", annotatedAt: nowMinutes },
    };
    // Sequence: delete original FIRST so the dual-doc state can never
    // surface (the user sees one chip turn into the other, not two).
    // Awaiting both surfaces failures rather than fire-and-forget.
    if (isRecorded(sourceEvent.lifecycle) && onDelete) {
      await onDelete(sourceEvent);
    }
    await onSave(bedtimeBase);
  };

  const handleKeepAsNap = () => {
    if (!pendingPastThresholdNap) return;
    const napCandidate = pendingPastThresholdNap;
    setPendingPastThresholdNap(null);
    void onSave(napCandidate);
  };

  const handleDismissPrompt = () => {
    // Escape / backdrop dismiss: clear the pending save without
    // committing. Returns the user to the drawer with their edits
    // intact so they can re-decide or change the time.
    setPendingPastThresholdNap(null);
  };

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
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
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
              value={timeInputValue(form.startTime)}
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
              value={timeInputValue(form.endTime)}
              onChange={(e) => setForm((prev) => ({ ...prev, endTime: parseHM24(e.target.value) }))}
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
              value={form.amountOz ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  amountOz: raw === "" ? undefined : Number(raw),
                }));
              }}
            />
          </label>
        )}

        {showOwner && (
          <OwnerPickerV3
            owners={owners}
            label="Owner"
            value={form.owner}
            onChange={(next) => setForm((prev) => ({ ...prev, owner: next }))}
          />
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
            disabled={hasErrors(errors) || form.startTime === undefined}
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={confirmCopy.title}
        body={confirmCopy.body}
        confirmLabel={confirmCopy.confirmLabel}
        cancelLabel="Keep"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          if (sourceEvent && onDelete) void onDelete(sourceEvent);
        }}
      />

      <ConfirmDialog
        open={pendingPastThresholdNap !== null}
        title="Change to bedtime?"
        body="This nap starts at or after your bedtime threshold. Saving as bedtime is usually what physiology calls for; keep it as a nap if you specifically intend an extra sleep before bedtime."
        confirmLabel="Yes, change to bedtime"
        cancelLabel="No, keep as nap"
        onCancel={handleKeepAsNap}
        onConfirm={() => {
          void handleConfirmChangeToBedtime();
        }}
        onDismiss={handleDismissPrompt}
      />
    </div>
  );
}
