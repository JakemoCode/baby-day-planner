"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import styles from "./PromoteTomorrowButton.module.css";

export type PromoteTomorrowButtonProps = {
  onPromote: () => void | Promise<void>;
  disabled?: boolean;
};

export function PromoteTomorrowButton({ onPromote, disabled = false }: PromoteTomorrowButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={() => setConfirmOpen(true)}
        disabled={disabled}
      >
        Promote to today
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Promote tomorrow to today?"
        body="Today's data will be archived and the planned day becomes the new active day."
        confirmLabel="Promote"
        cancelLabel="Cancel"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void onPromote();
        }}
      />
    </>
  );
}
