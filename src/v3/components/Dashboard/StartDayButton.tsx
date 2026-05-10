"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import actionStyles from "./ActionButton.module.css";
import styles from "./StartDayButton.module.css";

export type StartDayButtonProps = {
  hasTomorrowPlan: boolean;
  onStart: (input: { useTomorrowPlan: boolean }) => Promise<void>;
};

export function StartDayButton({ hasTomorrowPlan, onStart }: StartDayButtonProps) {
  const [pendingChoice, setPendingChoice] = useState<"plan" | "blank" | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [overflowOpen]);

  const primaryLabel = hasTomorrowPlan ? "Start Day from Plan" : "Start New Day";
  const dialogTitle =
    pendingChoice === "plan" ? "Start day from Tomorrow Plan?" : "Archive today and start fresh?";
  const dialogBody =
    pendingChoice === "plan"
      ? "Today's data will be archived and the planned day will become the new active day."
      : "Today's data will be archived. You'll be asked for a wake time.";

  const handleConfirm = () => {
    const useTomorrowPlan = pendingChoice === "plan";
    setPendingChoice(null);
    void onStart({ useTomorrowPlan });
  };

  return (
    <>
      <div className={styles.row}>
        <button
          type="button"
          className={`${actionStyles.button} ${styles.main}`}
          onClick={() => setPendingChoice(hasTomorrowPlan ? "plan" : "blank")}
        >
          {primaryLabel}
        </button>
        {hasTomorrowPlan && (
          <div className={styles.overflow} ref={overflowRef}>
            <button
              type="button"
              className={styles.overflowTrigger}
              aria-label="More start-day options"
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              onClick={() => setOverflowOpen((o) => !o)}
            >
              <svg
                className={styles.icon}
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="12" cy="6" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="12" cy="18" r="1.6" />
              </svg>
            </button>
            {overflowOpen && (
              <div className={styles.menu} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={styles.item}
                  onClick={() => {
                    setOverflowOpen(false);
                    setPendingChoice("blank");
                  }}
                >
                  Start blank instead
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingChoice !== null}
        title={dialogTitle}
        body={dialogBody}
        confirmLabel={pendingChoice === "plan" ? "Start day" : "Confirm"}
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={() => setPendingChoice(null)}
      />
    </>
  );
}
