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
  children: ReactNode;
};

export function AppShell({ childId, childName, children }: AppShellProps) {
  const { day } = useV3Day(childId);
  const dateProp = day?.date ? { date: day.date } : {};

  return (
    <div className={styles.shell}>
      <Header
        childName={childName}
        {...dateProp}
        actions={
          <>
            <SyncStatusIcon />
            <KebabMenu />
          </>
        }
      />
      <main className={styles.main}>{children}</main>
      <BottomTabs />
    </div>
  );
}
