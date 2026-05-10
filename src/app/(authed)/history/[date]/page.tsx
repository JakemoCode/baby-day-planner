"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Day } from "@/v3/schemas";
import { useV3Events } from "@/v3/hooks/useV3Events";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { getDayByDate } from "@/v3/repositories/days";
import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import { EmptyState } from "@/components/shared/EmptyState";
import { ArchivedDayView } from "@/v3/components/History/ArchivedDayView";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

export default function ArchivedDayPage() {
  const params = useParams<{ date: string }>();
  const date = params?.date ?? "";
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true);
  const { settings, loading: settingsLoading } = useV3Settings(CHILD_ID);

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

  const { events } = useV3Events(CHILD_ID, day?.id ?? "", settings?.owners);

  if (loading || settingsLoading) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading day" />
      </div>
    );
  }

  if (!day || !settings) {
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
      <ArchivedDayView
        day={day}
        events={events}
        owners={settings.owners}
        putdownLeadMinutes={settings.putdownLeadMinutes}
      />
    </div>
  );
}
