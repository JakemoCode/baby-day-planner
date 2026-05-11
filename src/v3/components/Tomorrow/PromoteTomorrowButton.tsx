/**
 * V3 PromoteTomorrowButton — pure presentational. Tapping invokes the
 * supplied handler with no confirmation. V3 dropped V2's in-component
 * dialog as a deliberate simplification — see FAST_FOLLOW §F12 for the
 * Save-for-Tomorrow flow that supersedes manual promote entirely.
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
