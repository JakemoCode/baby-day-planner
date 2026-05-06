"use client";

import { useEffect, useState } from "react";
import type { Day } from "@/domain";
import { listArchivedDays } from "@/repositories/days";
import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import { HistoryList } from "@/components/History/HistoryList";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

export default function HistoryPage() {
  const [days, setDays] = useState<Day[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listArchivedDays(db, CHILD_ID, 7).then((d) => {
      if (!cancelled) {
        setDays(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading history" />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Last 7 days</h1>
      <HistoryList days={days} />
    </div>
  );
}
