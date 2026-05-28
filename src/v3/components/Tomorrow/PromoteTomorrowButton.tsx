/** Pure presentational promote button; invokes handler directly, no confirmation dialog. */

"use client";

import styles from "./PromoteTomorrowButton.module.css";

export type PromoteTomorrowButtonProps = {
  onPromote: () => void | Promise<void>;
  disabled?: boolean;
};

export function PromoteTomorrowButton({ onPromote, disabled = false }: PromoteTomorrowButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => void onPromote()}
      disabled={disabled}
    >
      Promote to today
    </button>
  );
}
