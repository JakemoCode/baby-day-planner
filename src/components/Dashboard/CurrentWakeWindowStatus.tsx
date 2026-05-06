import type { Event, Owner } from "@/domain";
import { formatTimeForDisplay } from "@/domain";
import styles from "./CurrentWakeWindowStatus.module.css";

export type CurrentWakeWindowStatusProps = {
  wakeWindow: Event | undefined;
};

const OWNER_CSS: Record<Owner, string> = {
  Jake: styles["owner-jake"] ?? "",
  Kelly: styles["owner-kelly"] ?? "",
  Daycare: styles["owner-daycare"] ?? "",
};

export function CurrentWakeWindowStatus({ wakeWindow }: CurrentWakeWindowStatusProps) {
  if (!wakeWindow) return null;

  const ownerClass = wakeWindow.owner ? OWNER_CSS[wakeWindow.owner] : "";
  const endTime = wakeWindow.endTime ? formatTimeForDisplay(wakeWindow.endTime) : "";

  return (
    <div className={`${styles.pill} ${ownerClass}`} aria-live="polite">
      <span className={styles.dot} aria-hidden="true" />
      <span>
        In {wakeWindow.label}
        {wakeWindow.owner ? ` · ${wakeWindow.owner}` : ""}
        {endTime && <span className={styles.muted}> · ends {endTime}</span>}
      </span>
    </div>
  );
}
