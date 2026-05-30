"use client";

import { useEffect, useId, useState } from "react";
import styles from "./EventEditDrawer.module.css";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { Event, EventType, OwnerRef, OwnersConfig, TimeMin } from "../../schemas";
import { isRecorded, NO_OWNER } from "../../schemas";
import {
  isFutureProjected,
  isNextProjectedOfType,
  isActiveNap,
  isFocusNap,
  isNearestBottle,
} from "../../lifecycle";
import { isRenderSynthetic } from "../../lib/syntheticEvents";
import { recordedIdFor } from "../../lib/eventConventions";
import { formatHM24, formatTimeForDisplay, nextDayAt, parseHM24 } from "../../ui/time";
import { OwnerPickerV3 } from "./OwnerPickerV3";
import { formToEvent, type FormState } from "./formToEvent";
import { canDeleteEvent } from "./drawerDeletePolicy";

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
  /**
   * Today's actual wakeTime (from `Day.wakeTime`),
   * used to validate that an edited startTime isn't accidentally
   * AM/PM-confused below the day's wake (e.g. user types 12:30 meaning
   * 12:30pm but the picker reads it as 0:30am, which silently wrecks
   * the cascade by anchoring a pre-wake nap).
   *
   * Optional for backwards compatibility with the few call sites
   * (Tomorrow page) that don't have a live wakeTime.
   */
  dayWakeTime?: TimeMin;
  /**
   * Settings.napDurationMin — the "Min nap duration" soft floor. Drives the End-now
   * short-nap confirm: ending a nap shorter than this prompts before filling the field.
   * Optional; call sites without baby-event editing (e.g. /tomorrow) may omit it,
   * which disables the guard (End now fills directly).
   */
  napDurationMin?: TimeMin;
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
  dayWakeTime: TimeMin | undefined,
): FormErrors {
  const errors: FormErrors = {};
  // Pre-wake guard: an AM/PM picker mistake (12:30pm stored as 0:30am)
  // anchors a nap before wakeTime and silently wrecks the cascade. Naps
  // only — a baby asleep overnight is the overnight sleep, not a nap.
  // Bottles are exempt: per DOMAIN.md, overnight feeds are normal, do
  // NOT anchor the cascade (the engine filters anchors to
  // startTime >= wakeTime), and a pre-wake bottle time is
  // indistinguishable from a real 4am feed.
  const isCascadeAnchoring = type === "nap";
  if (
    isCascadeAnchoring &&
    dayWakeTime !== undefined &&
    startTime !== undefined &&
    startTime < dayWakeTime
  ) {
    const wakeStr = formatTimeForDisplay(dayWakeTime);
    errors.startTime = `Before today's wake time (${wakeStr}).`;
  }
  if (!errors.endTime && endTime !== undefined && startTime !== undefined && endTime <= startTime) {
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
      // Putdown synthetics share type "nap" for geometry but aren't real naps; skip.
      if (isRenderSynthetic(e)) return false;
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
  owner: OwnerRef; // always defined; NO_OWNER for unassigned
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
  dayWakeTime,
  napDurationMin,
  onSave,
  onCancel,
  onDelete,
  existingEvents,
}: EventEditDrawerV3Props) {
  const sourceEvent = event;
  const [form, setForm] = useState<InternalForm>(() => eventToForm(sourceEvent));
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Holds a nap that crossed bedtimeThreshold pending "Change to bedtime?" confirmation.
  const [pendingPastThresholdNap, setPendingPastThresholdNap] = useState<Event | null>(null);
  // True while the End-now short-nap confirm is open (fires on button press, not Save).
  const [shortNapConfirmOpen, setShortNapConfirmOpen] = useState(false);
  const titleId = useId();
  const startTimeId = useId();
  const endTimeId = useId();

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
  // Include the label in the heading so recurring events are named.
  const title =
    mode === "edit" && type === "daily_recurring" && sourceEvent.label
      ? `${baseTitle}: ${sourceEvent.label}`
      : baseTitle;

  // Delete visibility delegated to drawerDeletePolicy (pure, testable).
  const canDelete = canDeleteEvent(sourceEvent, { mode, hasOnDelete: onDelete !== undefined });

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

  // Lock time/amount on future-projected rhythm events except the chronologically-next
  // nap/bottle (editable so the user can pin the current rhythm anchor).
  const isNextOfType = isNextProjectedOfType(sourceEvent, existingEvents ?? [], nowMinutes);
  const futureProjected =
    mode === "edit" && isFutureProjected(sourceEvent, nowMinutes) && !isNextOfType;

  const siblings = existingEvents ?? [];
  const showStartNow =
    mode === "edit" && type === "nap" && isFocusNap(sourceEvent, siblings, nowMinutes);
  const showEndNow = showStartNow && isActiveNap(sourceEvent, nowMinutes);
  const showLogNow =
    mode === "edit" && type === "bottle" && isNearestBottle(sourceEvent, siblings, nowMinutes);

  const errors = validateForm(
    type,
    form.startTime,
    form.endTime,
    sourceEvent.id,
    existingEvents,
    dayWakeTime,
  );

  const applyStartTime = (next: TimeMin | undefined) => {
    // Naps and pumps preserve duration on startTime nudge. Extras don't auto-fill endTime.
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

  const handleStartTimeChange = (raw: string) => applyStartTime(parseHM24(raw));

  // Form-state only — can't trigger a cascade. See CONTEXT.md "drawer now shortcut".
  const handleStartNow = () => applyStartTime(nowMinutes);

  const setEndNow = () => setForm((prev) => ({ ...prev, endTime: nowMinutes }));

  const handleEndNow = () => {
    const isShort =
      napDurationMin !== undefined &&
      form.startTime !== undefined &&
      nowMinutes - form.startTime < napDurationMin;
    if (isShort) {
      setShortNapConfirmOpen(true);
      return;
    }
    setEndNow();
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
    const built = formToEvent(formForTransform, sourceEvent, nowMinutes, mode);
    // Sanitize future-projected saves back to source values so the edit routes through
    // setOwnerOverride (owner-only path) and never promotes the slot to recorded.
    // Label is included: isOwnerOnlyEdit checks it, so a label change would route to saveEvent.
    const next: Event = futureProjected
      ? {
          ...built,
          startTime: sourceEvent.startTime,
          label: sourceEvent.label,
          ...(sourceEvent.endTime !== undefined && { endTime: sourceEvent.endTime }),
          ...(sourceEvent.amountOz !== undefined && { amountOz: sourceEvent.amountOz }),
        }
      : built;

    // Trigger prompt when a nap's startTime crosses bedtimeThreshold in this edit.
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
    // Bedtime endTime is next-morning wake (defaultWakeTime + 24h), not the source nap's endTime.
    const bedtimeBase: Event = {
      // Deterministic id so subsequent edits write to the same Firestore doc.
      id: recordedIdFor("bedtime"),
      dayId: napCandidate.dayId,
      eventKey: "bedtime",
      type: "bedtime",
      kind: "block",
      label: "Bedtime",
      startTime: napCandidate.startTime,
      endTime: nextDayAt(defaultWakeTime),
      hasPutdown: false,
      owner: napCandidate.owner,
      lifecycle: { state: "recorded", annotatedAt: nowMinutes },
    };
    // Delete original first to avoid a brief dual-chip state.
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
    // Dismiss without committing; user returns to the drawer with edits intact.
    setPendingPastThresholdNap(null);
  };

  const handleConfirmShortNap = () => {
    setShortNapConfirmOpen(false);
    setEndNow();
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

        {futureProjected && (
          <p className={styles.futureNotice} role="note">
            This hasn&apos;t happened yet — only the owner is editable. Open the drawer again after
            it occurs to record an actual time.
          </p>
        )}

        {showLabel && (
          <label className={styles.field}>
            <span className={styles.label}>Label</span>
            <input
              type="text"
              className={styles.input}
              value={form.label}
              disabled={futureProjected}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="Pediatrician, library trip…"
            />
          </label>
        )}

        {showStartTime && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor={startTimeId}>
              Start time
            </label>
            <div className={styles.fieldRow}>
              <input
                id={startTimeId}
                type="time"
                className={styles.input}
                value={timeInputValue(form.startTime)}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                required
                disabled={futureProjected}
                {...(errors.startTime ? { "aria-invalid": true } : {})}
              />
              {(showStartNow || showLogNow) && (
                <button
                  type="button"
                  className={`${styles.nowButton} ${styles.nowStart}`}
                  onClick={handleStartNow}
                >
                  {showStartNow ? "Start now" : "Log now"}
                </button>
              )}
            </div>
            {errors.startTime && (
              <span className={styles.fieldError} role="alert">
                {errors.startTime}
              </span>
            )}
          </div>
        )}

        {showEndTime && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor={endTimeId}>
              End time
            </label>
            <div className={styles.fieldRow}>
              <input
                id={endTimeId}
                type="time"
                className={styles.input}
                value={timeInputValue(form.endTime)}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, endTime: parseHM24(e.target.value) }))
                }
                disabled={futureProjected}
                {...(errors.endTime ? { "aria-invalid": true } : {})}
              />
              {showEndNow && (
                <button
                  type="button"
                  className={`${styles.nowButton} ${styles.nowEnd}`}
                  onClick={handleEndNow}
                >
                  End now
                </button>
              )}
            </div>
            {errors.endTime && (
              <span className={styles.fieldError} role="alert">
                {errors.endTime}
              </span>
            )}
          </div>
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
              disabled={futureProjected}
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

      <ConfirmDialog
        open={shortNapConfirmOpen}
        title="Are you sure?"
        body={`This nap is shorter than your minimum nap setting of ${napDurationMin} minutes.`}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onCancel={() => setShortNapConfirmOpen(false)}
        onConfirm={handleConfirmShortNap}
        onDismiss={() => setShortNapConfirmOpen(false)}
      />
    </div>
  );
}
