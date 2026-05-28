"use client";

import { useEffect, type ReactNode } from "react";
import styles from "./BottomSheet.module.css";

export type BottomSheetProps = {
  /** Whether the sheet is visible. When false, the component renders null. */
  open: boolean;
  /** Heading rendered at the top of the sheet (also used as ARIA label by default). */
  title: string;
  /** Invoked on backdrop click, the Cancel button, or Escape key. */
  onCancel: () => void;
  /** ARIA label override for the dialog. Defaults to `title`. */
  ariaLabel?: string;
  /** Sheet body. */
  children: ReactNode;
};

/** Slide-up bottom sheet with backdrop, grab handle, and Cancel. Dismisses on backdrop click or Escape. */
export function BottomSheet({ open, title, onCancel, ariaLabel, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

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
        aria-label={ariaLabel ?? title}
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.handle} aria-hidden="true" />
        <h2 className={styles.title}>{title}</h2>
        {children}
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
