/** Loading skeleton matching dashboard layout shape; prevents "Start first day" CTA flash during subscription warm-up. */
import styles from "./DashboardSkeleton.module.css";

export function DashboardSkeleton() {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Loading dashboard">
      <div className={`${styles.block} ${styles.banner}`} />
      <div className={`${styles.block} ${styles.next}`} />
      <div className={`${styles.block} ${styles.panel}`} />
      <div className={`${styles.block} ${styles.panel}`} />
      <div className={styles.actions}>
        <div className={`${styles.block} ${styles.actionButton}`} />
        <div className={`${styles.block} ${styles.actionButton}`} />
      </div>
    </div>
  );
}
