import type { ReactNode } from "react";
import styles from "./Header.module.css";

export type HeaderProps = {
  childName: string;
  /** ISO date string "YYYY-MM-DD" — child's date of birth. Renders age beside name. */
  dateOfBirth?: string;
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
  // Parse as local date to avoid UTC off-by-one.
  const d = dateStr ? parseLocalDate(dateStr) : new Date();
  return DATE_FORMATTER.format(d);
}

function parseLocalDate(yyyymmdd: string): Date {
  const [y, m, day] = yyyymmdd.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1);
}

/** Formats age in parent-talk units: days (<14d), weeks (<12w), months (<24m), years. */
export function formatAge(dob: string, now: Date = new Date()): string {
  const birth = parseLocalDate(dob);
  const ms = now.getTime() - birth.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 0) return "";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  const weeks = Math.floor(days / 7);
  if (weeks < 12) return `${weeks} weeks`;
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 24) return `${months} months`;
  return `${Math.floor(months / 12)} years`;
}

export function Header({ childName, dateOfBirth, date, actions }: HeaderProps) {
  const age = dateOfBirth ? formatAge(dateOfBirth) : "";
  return (
    <header className={styles.header}>
      <div className={styles.title}>
        <span className={styles.name}>
          {childName}
          {age && <span className={styles.age}>, {age}</span>}
        </span>
        <span className={styles.date}>{formatDate(date)}</span>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
