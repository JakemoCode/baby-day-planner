import type { Day, Event } from "@/domain";
import { TimelineList } from "@/components/Timeline/TimelineList";
import styles from "./ArchivedDayView.module.css";

export type ArchivedDayViewProps = {
  day: Day;
  events: Event[];
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

export function ArchivedDayView({ day, events, onEditEvent }: ArchivedDayViewProps) {
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
        <TimelineList events={events} {...(onEditEvent ? { onEventTap: onEditEvent } : {})} />
      )}
    </div>
  );
}
