import type { Day, Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { TimelineV3 } from "@/v3/components/Timeline/TimelineV3";
import styles from "./ArchivedDayView.module.css";

export type ArchivedDayViewProps = {
  day: Day;
  events: Event[];
  owners: OwnersConfig;
  putdownLeadMinutes: TimeMin;
  /** When provided, events become tappable and forward to this handler. */
  onEditEvent?: (event: Event) => void;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function parseLocalDate(yyyymmdd: string): Date {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function ArchivedDayView({
  day,
  events,
  owners,
  putdownLeadMinutes,
  onEditEvent,
}: ArchivedDayViewProps) {
  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <h1 className={styles.heading}>{DATE_FORMATTER.format(parseLocalDate(day.date))}</h1>
      </header>
      {events.length === 0 ? (
        <div className={styles.empty} role="status">
          No events recorded for this day.
        </div>
      ) : (
        // Archived days are entirely past; nowMinutes omitted so dimPast is a
        // no-op. Read-only view — no scroll-to-now, no NowBar.
        <TimelineV3
          events={events}
          owners={owners}
          putdownLeadMinutes={putdownLeadMinutes}
          dimPast={false}
          {...(onEditEvent ? { onEventTap: onEditEvent } : {})}
        />
      )}
    </div>
  );
}
