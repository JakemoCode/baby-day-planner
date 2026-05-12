"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Day, Event } from "@/v3/schemas";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { getDayByDate } from "@/v3/repositories/days";
import { listEvents } from "@/v3/repositories/events";
import { withV3EventDefaults } from "@/v3/firestore/eventDefaults";
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
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const { settings, loading: settingsLoading } = useV3Settings(CHILD_ID);

  useEffect(() => {
    let cancelled = false;
    getDayByDate(db, CHILD_ID, date)
      .then((d) => {
        if (!cancelled) {
          setDay(d);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[history detail] getDayByDate failed", err);
        setError("Could not load this day. Please try again.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  useEffect(() => {
    if (!day?.id || !settings?.owners) return;
    const ownersRef = settings.owners;
    let cancelled = false;
    listEvents(db, CHILD_ID, day.id)
      .then((raw) => {
        if (cancelled) return;
        setEvents(raw.map((e) => withV3EventDefaults(e, ownersRef)));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[history detail] listEvents failed", err);
        setEventsError("Could not load events for this day.");
        setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [day?.id, settings?.owners]);

  if (loading || settingsLoading) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading day" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <Link href="/history" className={styles.backLink}>
          ← History
        </Link>
        <EmptyState title="Couldn’t load day" body={error} />
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

  if (events === null) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading day" />
      </div>
    );
  }

  if (eventsError) {
    return (
      <div className={styles.page}>
        <Link href="/history" className={styles.backLink}>
          ← History
        </Link>
        <EmptyState title="Couldn’t load events" body={eventsError} />
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
        colorMode={settings.timelineColorMode}
      />
    </div>
  );
}
