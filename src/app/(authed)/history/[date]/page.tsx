"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Day } from "@/domain";
import { useEvents } from "@/hooks/useEvents";
import { getDayByDate } from "@/repositories/days";
import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import { EmptyState } from "@/components/shared/EmptyState";
import { ArchivedDayView } from "@/components/History/ArchivedDayView";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

export default function ArchivedDayPage() {
  const params = useParams<{ date: string }>();
  const date = params?.date ?? "";
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDayByDate(db, CHILD_ID, date).then((d) => {
      if (!cancelled) {
        setDay(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const { events } = useEvents(CHILD_ID, day?.id ?? "__no_day__");

  if (loading) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading day" />
      </div>
    );
  }

  if (!day) {
    return (
      <div className={styles.page}>
        <Link href="/history" className={styles.backLink}>
          ← History
        </Link>
        <EmptyState title="Day not found" body={`No archived day for ${date}.`} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link href="/history" className={styles.backLink}>
        ← History
      </Link>
      <ArchivedDayView day={day} events={events} />
    </div>
  );
}
