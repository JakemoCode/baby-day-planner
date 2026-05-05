import styles from "./CurrentTimeIndicator.module.css";

export type CurrentTimeIndicatorProps = {
  topPx: number;
  timeLabel: string;
};

export function CurrentTimeIndicator({ topPx, timeLabel }: CurrentTimeIndicatorProps) {
  return (
    <div
      className={styles.indicator}
      role="presentation"
      aria-label={`Current time ${timeLabel}`}
      style={{ top: `${topPx}px` }}
    >
      <span className={styles.label}>{timeLabel}</span>
      <div className={styles.line} />
    </div>
  );
}
