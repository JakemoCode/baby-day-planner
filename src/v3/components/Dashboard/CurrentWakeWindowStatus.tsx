import type { Event, OwnersConfig } from "@/v3/schemas";
import { formatTimeForDisplay } from "@/v3/ui/time";
import { ownerColor, ownerDisplayName } from "@/v3/ui/owners";
import styles from "./CurrentWakeWindowStatus.module.css";

export type CurrentWakeWindowStatusProps = {
  wakeWindow: Event | undefined;
  owners: OwnersConfig;
};

export function CurrentWakeWindowStatus({ wakeWindow, owners }: CurrentWakeWindowStatusProps) {
  if (!wakeWindow) return null;

  const ownerName = ownerDisplayName(wakeWindow.owner, owners);
  const color = ownerColor(wakeWindow.owner, owners);
  const ownerStyle = color ? ({ "--owner-color": color } as React.CSSProperties) : undefined;
  const endTime = wakeWindow.endTime !== undefined ? formatTimeForDisplay(wakeWindow.endTime) : "";

  return (
    <div className={styles.pill} style={ownerStyle} aria-live="polite">
      <span className={styles.dot} aria-hidden="true" />
      <span>
        In {wakeWindow.label}
        {ownerName ? ` · ${ownerName}` : ""}
        {endTime && <span className={styles.muted}> · ends {endTime}</span>}
      </span>
    </div>
  );
}
