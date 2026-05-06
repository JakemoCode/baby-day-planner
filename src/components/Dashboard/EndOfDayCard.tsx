import { StartDayButton } from "./StartDayButton";
import styles from "./EndOfDayCard.module.css";

export type EndOfDayCardProps = {
  afterMidnight: boolean;
  hasTomorrowPlan: boolean;
  onStart: (options: { useTomorrowPlan: boolean }) => void | Promise<void>;
};

export function EndOfDayCard({ afterMidnight, hasTomorrowPlan, onStart }: EndOfDayCardProps) {
  if (!afterMidnight) {
    return (
      <article className={styles.card} aria-label="End of day">
        <p className={styles.message}>Have a good night</p>
        <p className={styles.subtitle}>The day is done — events will resume after midnight.</p>
      </article>
    );
  }

  return (
    <article className={styles.card} aria-label="Start the new day">
      <p className={styles.message}>{hasTomorrowPlan ? "Tap to start plan" : "Tap to start day"}</p>
      <p className={styles.subtitle}>
        {hasTomorrowPlan
          ? "Today's plan is ready when you are."
          : "Set wake time when you're ready."}
      </p>
      <div className={styles.actions}>
        <StartDayButton hasTomorrowPlan={hasTomorrowPlan} onStart={onStart} />
      </div>
    </article>
  );
}
