/**
 * V3 PromoteTomorrowButton — pure presentational. Tapping invokes the
 * supplied handler; confirmation flow lives at the page level so the
 * button stays free of dialog state.
 */

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
