"use client";

/**
 * V3 TemplateOwnerPicker.
 *
 * Renders OwnerPickerV3 for a single event in an OwnershipTemplate.
 * The picker derives the current owner from the template (not from
 * event.owner) so that callers updating the template optimistically
 * see the new selection without waiting for owner-aware events to
 * re-resolve.
 *
 * Chrome is opt-in. When `title` or `onCancel` is passed, the picker
 * wraps itself in a sticky-bottom card with a header (label + Cancel).
 * When neither is passed, the picker renders bare — preserving the
 * original headless behavior for callers that supply their own chrome.
 */

import type { Event, OwnerRef, OwnershipTemplate, OwnersConfig } from "../../schemas";
import { OwnerPickerV3 } from "../shared/OwnerPickerV3";
import { getOwnerAt, templateSlotForEvent } from "./templateSlot";
import styles from "./TemplateOwnerPicker.module.css";

export type TemplateOwnerPickerProps = {
  event: Event;
  template: OwnershipTemplate;
  owners: OwnersConfig;
  onSelect: (owner: OwnerRef | undefined) => void;
  /** Header label rendered inside the picker's card chrome. */
  title?: string;
  /** Dismiss handler. When set, renders a Cancel button alongside the title. */
  onCancel?: () => void;
};

export function TemplateOwnerPicker({
  event,
  template,
  owners,
  onSelect,
  title,
  onCancel,
}: TemplateOwnerPickerProps) {
  const slot = templateSlotForEvent(event);
  const current = slot === undefined ? undefined : getOwnerAt(template, slot);
  const picker = (
    <OwnerPickerV3 owners={owners} value={current} onChange={onSelect} label={event.label} />
  );

  // No chrome requested → behave like a bare picker (preserves existing
  // tests and callers that supply their own wrapper).
  if (title === undefined && onCancel === undefined) return picker;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        {title !== undefined && <span className={styles.title}>{title}</span>}
        {onCancel !== undefined && (
          <button type="button" className={styles.cancel} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {picker}
    </div>
  );
}
