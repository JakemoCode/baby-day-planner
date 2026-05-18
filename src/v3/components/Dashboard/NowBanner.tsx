import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { formatHoursMinutes, formatTimeForDisplay } from "@/v3/ui/time";
import { ownerColor, ownerDisplayName } from "@/v3/ui/owners";
import { ownerStyleVar } from "@/v3/ui/ownerStyle";
import styles from "./NowBanner.module.css";

export type NowBannerProps = {
  wakeWindow?: Event;
  inProgressNap?: Event;
  inProgressBedtime?: Event;
  owners: OwnersConfig;
  nowMinutes: TimeMin;
};

/**
 * Single banner slot. Content priority (highest first):
 *   1. in-progress bedtime
 *   2. in-progress nap
 *   3. current wake window
 *   4. nothing
 *
 * These are mutually exclusive in normal flow — the engine cascade
 * guarantees a wake window starts immediately after a nap ends.
 */
export function NowBanner({
  wakeWindow,
  inProgressNap,
  inProgressBedtime,
  owners,
  nowMinutes,
}: NowBannerProps) {
  if (inProgressBedtime) {
    return (
      <InProgressBanner
        label="Bedtime in progress"
        event={inProgressBedtime}
        owners={owners}
        nowMinutes={nowMinutes}
      />
    );
  }
  if (inProgressNap) {
    return (
      <InProgressBanner
        label="Nap in progress"
        event={inProgressNap}
        owners={owners}
        nowMinutes={nowMinutes}
      />
    );
  }
  if (!wakeWindow) return null;

  const ownerName = ownerDisplayName(wakeWindow.owner, owners);
  const endTime = wakeWindow.endTime !== undefined ? formatTimeForDisplay(wakeWindow.endTime) : "";

  return (
    <div
      className={styles.pill}
      style={ownerStyleVar(ownerColor(wakeWindow.owner, owners))}
      aria-live="polite"
    >
      <span className={styles.dot} aria-hidden="true" />
      <span>
        In {wakeWindow.label}
        {ownerName ? ` · ${ownerName}` : ""}
        {endTime && <span className={styles.muted}> · ends {endTime}</span>}
      </span>
    </div>
  );
}

function InProgressBanner({
  label,
  event,
  owners,
  nowMinutes,
}: {
  label: string;
  event: Event;
  owners: OwnersConfig;
  nowMinutes: TimeMin;
}) {
  const elapsed = Math.max(0, nowMinutes - event.startTime);
  return (
    <div
      className={styles.pill}
      style={ownerStyleVar(ownerColor(event.owner, owners))}
      aria-live="polite"
    >
      <span className={styles.dot} aria-hidden="true" />
      <span>
        {label} <span className={styles.muted}>— {formatHoursMinutes(elapsed)}</span>
      </span>
    </div>
  );
}
