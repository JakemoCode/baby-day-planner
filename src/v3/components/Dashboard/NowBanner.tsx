import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { formatHoursMinutes } from "@/v3/ui/time";
import { ownerColor } from "@/v3/ui/owners";
import { ownerStyleVar } from "@/v3/ui/ownerStyle";
import styles from "./NowBanner.module.css";

export type NowBannerProps = {
  inProgressNap?: Event;
  inProgressBedtime?: Event;
  owners: OwnersConfig;
  nowMinutes: TimeMin;
};

/**
 * Sleep-only banner: in-progress bedtime > nap, mutually exclusive by the
 * engine cascade. Shows elapsed sleep time, which appears nowhere else.
 * Deliberately silent during a wake window — its end time only duplicated
 * the next-nap time already shown in the Next sleep panel.
 */
export function NowBanner({
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
  return null;
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
