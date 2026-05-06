"use client";

import { useEffect, useId, useState } from "react";
import type { Event, EventType, Owner } from "@/domain";
import { ConfirmDialog } from "./ConfirmDialog";
import { OwnerPicker } from "./OwnerPicker";
import styles from "./EventEditDrawer.module.css";

export type EventEditDrawerMode = "edit" | "create-extra";

export type EventEditDrawerProps = {
  open: boolean;
  event: Event | null;
  mode: EventEditDrawerMode;
  /** Required when mode === "create-extra" so the new event has a parent day. */
  dayId?: string;
  onSave: (event: Event) => void | Promise<void>;
  onCancel: () => void;
  onDelete?: (event: Event) => void | Promise<void>;
};

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
  const next: Event = {
    ...source,
    type,
    startTime: form.startTime,
    label: form.label || source.label,
    source: source.source === "projected" ? "manual" : source.source,
    status: source.status === "projected" ? "overridden" : source.status,
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

const TITLE_BY_TYPE: Record<EventType, string> = {
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

function createExtraTemplate(dayId: string): Event {
  return {
    id: `extra-${Date.now()}`,
    dayId,
    eventKey: `extra_${Date.now()}`,
    type: "extra",
    label: "",
    startTime: "12:00",
    source: "manual",
    status: "completed",
  };
}

export function EventEditDrawer({
  open,
  event,
  mode,
  dayId,
  onSave,
  onCancel,
  onDelete,
}: EventEditDrawerProps) {
  const sourceEvent = mode === "create-extra" ? createExtraTemplate(dayId ?? "") : (event as Event);

  const [form, setForm] = useState<FormState>(() => eventToForm(sourceEvent));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const titleId = useId();

  // Form state is derived from the source event on first render only.
  // To force a fresh form when the event changes, parents should pass
  // `<EventEditDrawer key={event?.id ?? "new"} … />` so React remounts
  // the component (cleaner than syncing state inside an effect).

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;
  if (mode === "edit" && !event) return null;

  const type = sourceEvent.type;
  const title = mode === "create-extra" ? "Add event" : TITLE_BY_TYPE[type];
  const canDelete =
    mode === "edit" &&
    onDelete !== undefined &&
    (event?.source === "actual" || event?.source === "manual");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const showStartTime = type !== "wake_window";
  const showEndTime = type === "nap" || type === "extra";
  const showAmount = type === "bottle" || type === "dream_feed";
  const showOwner =
    type === "nap" || type === "wake_window" || type === "bottle" || type === "extra";
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
              onChange={(e) => set("startTime", e.target.value)}
              required
            />
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
            />
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
            onClick={() => {
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
          if (event && onDelete) void onDelete(event);
        }}
      />
    </div>
  );
}
