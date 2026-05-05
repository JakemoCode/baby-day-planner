"use client";

import styles from "./FAB.module.css";

export type FABProps = {
  label: string;
  onClick: () => void;
};

export function FAB({ label, onClick }: FABProps) {
  return (
    <button type="button" className={styles.fab} aria-label={label} onClick={onClick}>
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
