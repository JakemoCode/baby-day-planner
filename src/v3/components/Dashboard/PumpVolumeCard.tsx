import styles from "./PumpVolumeCard.module.css";

export type PumpVolumeCardProps = {
  /** Sum of left + right across today's recorded pumps (already rounded). */
  totalOz: number;
};

export function PumpVolumeCard({ totalOz }: PumpVolumeCardProps) {
  return (
    <div className={styles.card}>
      <span className={styles.label}>Total pump volume today</span>
      {/* Number#toString trims trailing zeros (7 / 7.5 / 7.25); pumpTotalOz pre-rounds. */}
      <span className={styles.value}>{totalOz} oz</span>
    </div>
  );
}
