import type { Day } from "@/v3/schemas";
import styles from "./HistoryDayCard.module.css";

export type HistoryDayCardSummary = {
  bottles: number;
  naps: number;
  totalOz: number;
};

export type HistoryDayCardProps = {
  day: Day;
  onSelect: (dayId: string) => void;
  summary?: HistoryDayCardSummary;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function parseLocalDate(yyyymmdd: string): Date {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function summarize(s: HistoryDayCardSummary): string {
  return `${pluralize(s.bottles, "bottle")} · ${pluralize(s.naps, "nap")} · ${s.totalOz} oz`;
}

export function HistoryDayCard({ day, onSelect, summary }: HistoryDayCardProps) {
  return (
    <button type="button" className={styles.card} onClick={() => onSelect(day.id)}>
      <span className={styles.date}>{DATE_FORMATTER.format(parseLocalDate(day.date))}</span>
      {summary && <span className={styles.summary}>{summarize(summary)}</span>}
    </button>
  );
}
