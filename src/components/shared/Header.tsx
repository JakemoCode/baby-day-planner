import type { ReactNode } from "react";
import styles from "./Header.module.css";

export type HeaderProps = {
  childName: string;
  /** ISO date string "YYYY-MM-DD". Defaults to today. */
  date?: string;
  /** Right-side actions (e.g. SyncStatusIcon + KebabMenu). */
  actions?: ReactNode;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function formatDate(dateStr: string | undefined): string {
  // Parse "YYYY-MM-DD" as a local date (not UTC, to avoid off-by-one).
  const d = dateStr ? parseLocalDate(dateStr) : new Date();
  return DATE_FORMATTER.format(d);
}

function parseLocalDate(yyyymmdd: string): Date {
  const [y, m, day] = yyyymmdd.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1);
}

export function Header({ childName, date, actions }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.title}>
        <span className={styles.name}>{childName}&apos;s Day</span>
        <span className={styles.date}>{formatDate(date)}</span>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
