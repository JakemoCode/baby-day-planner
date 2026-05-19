"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Day } from "@/v3/schemas";
import { listArchivedDays } from "@/v3/repositories/days";
import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import { EmptyState } from "@/components/shared/EmptyState";
import { HistoryList } from "@/v3/components/History/HistoryList";
import styles from "./page.module.css";
import { useCurrentChild } from "@/v3/context/ChildProvider";

export default function HistoryPage() {
  const CHILD_ID = useCurrentChild().id;
  const router = useRouter();
  const [days, setDays] = useState<Day[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listArchivedDays(db, CHILD_ID, 7)
      .then((d) => {
        if (!cancelled) {
          setDays(d);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[history] listArchivedDays failed", err);
        setError("Could not load history. Please try again.");
        setLoading(false);
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

  if (error) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>Last 7 days</h1>
        <EmptyState title="Couldn’t load history" body={error} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Last 7 days</h1>
      <HistoryList
        days={days}
        onSelect={(dayId) => {
          const day = days.find((d) => d.id === dayId);
          if (day) router.push(`/history/${day.date}`);
        }}
      />
    </div>
  );
}
