"use client";

import { useMemo, useState } from "react";
import type { Day, Event, OwnerRef, OwnershipTemplate } from "@/v3/schemas";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { useV3Templates } from "@/v3/hooks/useV3Templates";
import { useV3Projection } from "@/v3/hooks/useV3Projection";
import { PLACEHOLDER_SETTINGS } from "@/v3/hooks/projectionPlaceholders";
import { saveTemplate } from "@/v3/repositories/templates";
import { setOwnerInTemplate } from "@/v3/components/DayTemplates/setOwnerInTemplate";
import { templateSlotForEvent } from "@/v3/components/DayTemplates/templateSlot";
import { TemplateOwnerPicker } from "@/v3/components/DayTemplates/TemplateOwnerPicker";
import { TimelineV3 } from "@/v3/components/Timeline/TimelineV3";
import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";
const SATURDAY_ID = "tmpl-saturday";
const SUNDAY_ID = "tmpl-sunday";
const SYNTHETIC_DAY_ID = "tmpl-projection";

const DEFAULT_SAT: OwnershipTemplate = {
  id: SATURDAY_ID,
  displayName: "Saturday",
  napOwners: [],
  wakeWindowOwners: [],
};

const DEFAULT_SUN: OwnershipTemplate = {
  id: SUNDAY_ID,
  displayName: "Sunday",
  napOwners: [],
  wakeWindowOwners: [],
};

type DayKey = "saturday" | "sunday";

export default function DayTemplatesPage() {
  const { settings, loading: settingsLoading } = useV3Settings(CHILD_ID);
  const { templates, loading: templatesLoading } = useV3Templates(CHILD_ID);
  const [selectedDay, setSelectedDay] = useState<DayKey>("saturday");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // Local override after a save — listTemplates is one-shot; this keeps
  // the UI reflecting the latest edits without a manual refetch.
  const [edits, setEdits] = useState<Record<string, OwnershipTemplate>>({});

  const saturday = edits[SATURDAY_ID] ?? templates.find((t) => t.id === SATURDAY_ID) ?? DEFAULT_SAT;
  const sunday = edits[SUNDAY_ID] ?? templates.find((t) => t.id === SUNDAY_ID) ?? DEFAULT_SUN;
  const activeTemplate = selectedDay === "saturday" ? saturday : sunday;

  // Synthetic day for the preview projection. V3 `Day` requires
  // `suppressedRecurringIds` and `suppressedDaycareDay`; `wakeTime` is
  // a TimeMin (number), not a "HH:MM" string.
  const syntheticDay: Day = useMemo(
    () => ({
      id: SYNTHETIC_DAY_ID,
      childId: CHILD_ID,
      date: "2026-01-04",
      status: "planned",
      wakeTime: settings?.defaultWakeTime ?? 7 * 60,
      suppressedRecurringIds: [],
      suppressedDaycareDay: false,
    }),
    [settings?.defaultWakeTime],
  );

  // V3 engine projects bottle placeholders from `settings.bottleChain`,
  // so no seed actuals are needed. PLACEHOLDER_SETTINGS keeps the hook
  // order stable while real settings load; the early-return below
  // guarantees we never render output derived from the placeholder.
  const projected = useV3Projection({
    day: syntheticDay,
    settings: settings ?? PLACEHOLDER_SETTINGS,
    actuals: [] as Event[],
    template: activeTemplate,
  });

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

  const handleOwnerChange = async (owner: OwnerRef | undefined) => {
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

      <TimelineV3
        events={projected}
        owners={settings.owners}
        putdownLeadMinutes={settings.putdownLeadMinutes}
        colorMode={settings.timelineColorMode}
        dimPast={false}
        pxPerHour={settings.timelinePxPerHour}
        onEventTap={(event) => {
          // Gate via templateSlotForEvent — non-mappable events (extras,
          // pumps) have no template slot and shouldn't open the picker.
          if (templateSlotForEvent(event) === undefined) return;
          setSelectedEventId(event.id);
        }}
      />

      {selectedEvent && (
        <div className={styles.pickerWrap}>
          <div className={styles.pickerHeader}>
            <span className={styles.pickerLabel}>Owner for {selectedEvent.label}</span>
            <button
              type="button"
              className={styles.pickerCancel}
              onClick={() => setSelectedEventId(null)}
            >
              Cancel
            </button>
          </div>
          <TemplateOwnerPicker
            event={selectedEvent}
            template={activeTemplate}
            owners={settings.owners}
            onSelect={(owner) => {
              void handleOwnerChange(owner);
            }}
          />
        </div>
      )}
    </div>
  );
}
