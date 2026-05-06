import Link from "next/link";
import styles from "./HistoryDayCard.module.css";

export type HistoryDayCardSummary = {
  bottles: number;
  naps: number;
  totalOz: number;
};

export type HistoryDayCardProps = {
  /** ISO date "YYYY-MM-DD" */
  date: string;
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

export function HistoryDayCard({ date, summary }: HistoryDayCardProps) {
  return (
    <Link href={`/history/${date}`} className={styles.card}>
      <span className={styles.date}>{DATE_FORMATTER.format(parseLocalDate(date))}</span>
      {summary && <span className={styles.summary}>{summarize(summary)}</span>}
    </Link>
  );
}
