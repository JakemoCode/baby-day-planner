"use client";

import { useEffect, useId } from "react";
import styles from "./ConfirmDialog.module.css";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Escape/backdrop handler. Use when Cancel is destructive and "I haven't decided" should be a no-op. Falls back to onCancel. */
  onDismiss?: () => void;
};

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  onDismiss,
}: ConfirmDialogProps) {
  const titleId = useId();
  const handleDismiss = onDismiss ?? onCancel;

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, handleDismiss]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.dialog}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {body && <p className={styles.body}>{body}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={styles.confirm} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
