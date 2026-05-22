/**
 * Skeleton placeholder for the dashboard while the active-day +
 * settings subscriptions are still warming up. Mirrors the rough block
 * layout of the real dashboard (NowBanner, NextEventCard, two panels,
 * action row) so the user sees the right SHAPE appear, then content
 * fills in, instead of a "Start first day" CTA flash → real dashboard
 * (which made the app look broken for ~500ms after onboarding).
 */
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
