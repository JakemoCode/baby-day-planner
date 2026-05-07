"use client";

import { useMemo, useState } from "react";
import type { Day, Event, Owner, OwnershipTemplate } from "@/domain";
import { makeEvent, projectDay } from "@/domain";
import { useSettings } from "@/hooks/useSettings";
import { useTemplates } from "@/hooks/useTemplates";
import { saveTemplate } from "@/repositories/templates";
import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import { TimelineList } from "@/components/Timeline/TimelineList";
import { TemplateOwnerPicker } from "@/components/DayTemplates/TemplateOwnerPicker";
import { ASSIGNABLE_TYPES, setOwnerInTemplate } from "@/components/DayTemplates/setOwnerInTemplate";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";
const SATURDAY_ID = "tmpl-saturday";
const SUNDAY_ID = "tmpl-sunday";
const SYNTHETIC_DAY_ID = "tmpl-projection";
const SYNTHETIC_WAKE_TIME = "07:00";

const DEFAULT_SAT: OwnershipTemplate = {
  id: SATURDAY_ID,
  label: "Saturday",
  napOwners: [],
  wakeWindowOwners: [],
};

const DEFAULT_SUN: OwnershipTemplate = {
  id: SUNDAY_ID,
  label: "Sunday",
  napOwners: [],
  wakeWindowOwners: [],
};

type DayKey = "saturday" | "sunday";

export default function DayTemplatesPage() {
  const { settings, loading: settingsLoading } = useSettings(CHILD_ID);
  const { templates, loading: templatesLoading } = useTemplates(CHILD_ID);
  const [selectedDay, setSelectedDay] = useState<DayKey>("saturday");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // Local override after a save — Firestore listener isn't wired for templates,
  // so we keep the latest edited copy here so the UI reflects new owners.
  const [edits, setEdits] = useState<Record<string, OwnershipTemplate>>({});

  const saturday = edits[SATURDAY_ID] ?? templates.find((t) => t.id === SATURDAY_ID) ?? DEFAULT_SAT;
  const sunday = edits[SUNDAY_ID] ?? templates.find((t) => t.id === SUNDAY_ID) ?? DEFAULT_SUN;
  const activeTemplate = selectedDay === "saturday" ? saturday : sunday;

  const syntheticDay: Day = useMemo(
    () => ({
      id: SYNTHETIC_DAY_ID,
      childId: CHILD_ID,
      date: "2026-01-04",
      status: "planned",
      wakeTime: SYNTHETIC_WAKE_TIME,
      createdAt: "2026-01-04T07:00:00Z",
    }),
    [],
  );

  const projected = useMemo(() => {
    if (!settings) return [];
    // Seed bottle_1 at wake time so the bottle chain projects a typical day's
    // worth of bottles to assign owners against.
    const seed: Event = makeEvent({
      id: `${SYNTHETIC_DAY_ID}-bottle-1-seed`,
      dayId: SYNTHETIC_DAY_ID,
      eventKey: "bottle_1",
      type: "bottle",
      label: "Bottle 1",
      startTime: SYNTHETIC_WAKE_TIME,
      amountOz: settings.defaultBottleAmountOz,
      source: "actual",
      status: "actual",
    });
    return projectDay({
      day: syntheticDay,
      settings,
      actuals: [seed],
      template: activeTemplate,
    });
  }, [settings, syntheticDay, activeTemplate]);

  const selectedEvent = useMemo(
    () => projected.find((e) => e.id === selectedEventId) ?? null,
    [projected, selectedEventId],
  );

  if (settingsLoading || templatesLoading) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading day templates" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>
          Set up the basics in Settings before assigning weekend ownership.
        </p>
      </div>
    );
  }

  const handleOwnerChange = async (owner: Owner) => {
    if (!selectedEvent) return;
    const next = setOwnerInTemplate(activeTemplate, selectedEvent, owner);
    setEdits((prev) => ({ ...prev, [next.id]: next }));
    setSelectedEventId(null);
    await saveTemplate(db, CHILD_ID, next);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Day templates</h1>
        <p className={styles.subheading}>
          Tap a nap, wake window, or bottle to assign an owner. The schedule below is a typical day
          built from your settings.
        </p>
      </header>

      <div className={styles.dayPicker} role="tablist" aria-label="Day to edit">
        <button
          type="button"
          role="tab"
          aria-selected={selectedDay === "saturday"}
          className={selectedDay === "saturday" ? styles.dayTabActive : styles.dayTab}
          onClick={() => {
            setSelectedDay("saturday");
            setSelectedEventId(null);
          }}
        >
          Saturday
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={selectedDay === "sunday"}
          className={selectedDay === "sunday" ? styles.dayTabActive : styles.dayTab}
          onClick={() => {
            setSelectedDay("sunday");
            setSelectedEventId(null);
          }}
        >
          Sunday
        </button>
      </div>

      <TimelineList
        events={projected}
        onEventTap={(event) => {
          if (!ASSIGNABLE_TYPES.includes(event.type)) return;
          setSelectedEventId(event.id);
        }}
      />

      {selectedEvent && (
        <TemplateOwnerPicker
          event={selectedEvent}
          onSelect={(owner) => {
            void handleOwnerChange(owner);
          }}
          onCancel={() => setSelectedEventId(null)}
        />
      )}
    </div>
  );
}
