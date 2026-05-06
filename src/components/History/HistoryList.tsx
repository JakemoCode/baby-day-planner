import type { Day } from "@/domain";
import { EmptyState } from "@/components/shared/EmptyState";
import { HistoryDayCard, type HistoryDayCardSummary } from "./HistoryDayCard";
import styles from "./HistoryList.module.css";

export type HistoryListProps = {
  days: Day[];
  /** Optional pre-computed summaries keyed by Day.id. */
  summaries?: Record<string, HistoryDayCardSummary>;
};

export function HistoryList({ days, summaries }: HistoryListProps) {
  if (days.length === 0) {
    return <EmptyState title="No past days yet" body="Archived days will appear here." />;
  }

  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className={styles.list}>
      {sorted.map((day) => {
        const summary = summaries?.[day.id];
        return <HistoryDayCard key={day.id} date={day.date} {...(summary ? { summary } : {})} />;
      })}
    </div>
  );
}
