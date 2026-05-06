"use client";

import type { ReactNode } from "react";
import { useDay } from "@/hooks/useDay";
import { BottomTabs } from "./BottomTabs";
import { Header } from "./Header";
import { KebabMenu } from "./KebabMenu";
import { SyncStatusIcon } from "./SyncStatusIcon";
import styles from "./AppShell.module.css";

export type AppShellProps = {
  childId?: string;
  childName: string;
  children: ReactNode;
};

const DEFAULT_CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

export function AppShell({ childId = DEFAULT_CHILD_ID, childName, children }: AppShellProps) {
  const { day } = useDay(childId);
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
