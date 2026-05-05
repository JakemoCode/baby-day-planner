import styles from "./LoadingState.module.css";

export type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "Loading" }: LoadingStateProps) {
  return (
    <div className={styles.root} role="status" aria-label={label}>
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.sr}>{label}</span>
    </div>
  );
}
