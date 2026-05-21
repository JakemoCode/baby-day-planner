"use client";

import type { ReactNode } from "react";
import { useV3Day } from "@/v3/hooks/useV3Day";
import { BottomTabs } from "./BottomTabs";
import { Header } from "./Header";
import { KebabMenu } from "./KebabMenu";
import { SyncStatusIcon } from "./SyncStatusIcon";
import styles from "./AppShell.module.css";

export type AppShellProps = {
  childId: string;
  childName: string;
  /** Optional ISO "YYYY-MM-DD" — when present, Header renders age beside name. */
  dateOfBirth?: string;
  children: ReactNode;
};

export function AppShell({ childId, childName, dateOfBirth, children }: AppShellProps) {
  const { day } = useV3Day(childId);
  const dateProp = day?.date ? { date: day.date } : {};
  const dobProp = dateOfBirth ? { dateOfBirth } : {};

  return (
    <div className={styles.shell}>
      <Header
        childName={childName}
        {...dobProp}
        {...dateProp}
        actions={
          <>
            <SyncStatusIcon />
            <KebabMenu />
          </>
        }
      />
      <main className={styles.main}>{children}</main>
      <BottomTabs childId={childId} />
    </div>
  );
}
