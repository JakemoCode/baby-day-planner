"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Day, Event, OwnerRef, OwnershipTemplate } from "@/v3/schemas";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { useV3Templates } from "@/v3/hooks/useV3Templates";
import { startNewDay } from "@/v3/repositories/days";
import { createEvent } from "@/v3/repositories/events";
import { saveTemplate } from "@/v3/repositories/templates";
import { newDayId } from "@/v3/lib/newEventId";
import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import { EventEditDrawerV3 } from "@/v3/components/shared/EventEditDrawerV3";
import { buildCreateTemplate } from "@/v3/components/shared/createEventTemplate";
import { TomorrowForm, type TomorrowFormValue } from "@/v3/components/Tomorrow/TomorrowForm";
import { TomorrowPreview } from "@/v3/components/Tomorrow/TomorrowPreview";
import { PromoteTomorrowButton } from "@/v3/components/Tomorrow/PromoteTomorrowButton";
import { TemplateOwnerPicker } from "@/v3/components/DayTemplates/TemplateOwnerPicker";
import { setOwnerInTemplate } from "@/v3/components/DayTemplates/setOwnerInTemplate";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

// Anchor the Tomorrow page's "now" to noon so create-templates and
// drawer constraints land in the middle of the planned day rather
// than wherever the user happens to be browsing from.
const TOMORROW_ANCHOR_MINUTES = 12 * 60;

type DrawerState =
  | { open: false }
  | { open: true; mode: "create"; template: Event }
  | { open: true; mode: "edit"; event: Event };

function tomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TomorrowPage() {
  const router = useRouter();
  const { settings, loading: settingsLoading } = useV3Settings(CHILD_ID);
  const { templates, loading: templatesLoading } = useV3Templates(CHILD_ID);

  const [form, setForm] = useState<TomorrowFormValue>({ wakeTime: 7 * 60 });
  const [extras, setExtras] = useState<Event[]>([]);
  const [drawer, setDrawer] = useState<DrawerState>({ open: false });
  const [pickedEvent, setPickedEvent] = useState<Event | null>(null);
  // Local override of the selected template so owner edits in the
  // preview reflect immediately without waiting for the listener
  // round-trip. (V3 listTemplates is one-shot, so without this the
  // preview wouldn't update at all until next mount.)
  const [templateOverride, setTemplateOverride] = useState<OwnershipTemplate | null>(null);

  const tomorrowDay = useMemo<Day>(() => {
    const day: Day = {
      id: `tomorrow-${tomorrowDateString()}`,
      childId: CHILD_ID,
      date: tomorrowDateString(),
      status: "planned",
      wakeTime: form.wakeTime,
      suppressedRecurringIds: [],
      suppressedDaycareDay: false,
    };
    if (form.templateId) day.templateId = form.templateId;
    return day;
  }, [form.wakeTime, form.templateId]);

  const selectedTemplate = useMemo<OwnershipTemplate | undefined>(() => {
    if (!form.templateId) return undefined;
    if (templateOverride && templateOverride.id === form.templateId) return templateOverride;
    return templates.find((t) => t.id === form.templateId);
  }, [form.templateId, templates, templateOverride]);

  if (settingsLoading || !settings || templatesLoading) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading tomorrow" />
      </div>
    );
  }

  const handlePromote = async () => {
    const promotedDayId = newDayId();
    await startNewDay(db, CHILD_ID, {
      newDayId: promotedDayId,
      newDate: tomorrowDateString(),
      newWakeTime: form.wakeTime,
      ...(form.templateId ? { templateId: form.templateId } : {}),
    });
    // Persist the planned extras to the freshly-created day. Jake's
    // product call (2026-05-10): users planning Tomorrow must trust
    // that extras survive promotion. Non-atomic by design — Firestore
    // transactions can't span the day write + N event writes; if any
    // event fails the day still exists with partial extras and the
    // user can re-add. Log loudly so the failure isn't silent.
    for (const extra of extras) {
      try {
        await createEvent(db, CHILD_ID, { ...extra, dayId: promotedDayId });
      } catch (err) {
        console.error("[tomorrow] failed to persist extra on promote", {
          eventId: extra.id,
          dayId: promotedDayId,
          err,
        });
      }
    }
    router.replace("/");
  };

  const handleAddExtra = () => {
    const tpl = buildCreateTemplate({
      type: "extra",
      dayId: tomorrowDay.id,
      actuals: extras,
      settings,
      nowMinutes: TOMORROW_ANCHOR_MINUTES,
    });
    setDrawer({ open: true, mode: "create", template: tpl });
  };

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Plan</h2>
        <TomorrowForm value={form} templates={templates} onChange={setForm} />
        <button type="button" onClick={handleAddExtra}>
          Add extra event
        </button>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Preview</h2>
        <TomorrowPreview
          day={tomorrowDay}
          settings={settings}
          owners={settings.owners}
          {...(selectedTemplate ? { template: selectedTemplate } : {})}
          extras={extras}
          onEventTap={(event) => {
            if (event.type === "extra") {
              setDrawer({ open: true, mode: "edit", event });
              return;
            }
            // Owner picker only meaningful when a template is selected;
            // without one there's nowhere to write the picked owner.
            if (!selectedTemplate) return;
            setPickedEvent(event);
          }}
        />
      </section>

      <PromoteTomorrowButton onPromote={handlePromote} />

      {pickedEvent && selectedTemplate && (
        <TemplateOwnerPicker
          event={pickedEvent}
          template={selectedTemplate}
          owners={settings.owners}
          onSelect={(owner: OwnerRef | undefined) => {
            const next = setOwnerInTemplate(selectedTemplate, pickedEvent, owner);
            setTemplateOverride(next);
            setPickedEvent(null);
            void saveTemplate(db, CHILD_ID, next);
          }}
        />
      )}

      <EventEditDrawerV3
        key={
          drawer.open && drawer.mode === "edit"
            ? drawer.event.id
            : drawer.open && drawer.mode === "create"
              ? drawer.template.id
              : "closed"
        }
        owners={settings.owners}
        nowMinutes={TOMORROW_ANCHOR_MINUTES}
        bedtimeThreshold={settings.bedtimeThreshold}
        defaultWakeTime={settings.defaultWakeTime}
        existingEvents={extras}
        open={drawer.open}
        event={drawer.open ? (drawer.mode === "edit" ? drawer.event : drawer.template) : null}
        mode={drawer.open && drawer.mode === "edit" ? "edit" : "create"}
        onSave={(event) => {
          if (drawer.open && drawer.mode === "edit") {
            if (extras.some((e) => e.id === drawer.event.id)) {
              setExtras((prev) => prev.map((e) => (e.id === event.id ? event : e)));
            } else {
              // Don't re-ID — the projected event's id (built via
              // `buildCreateTemplate`/`newEventId`) is already
              // collision-safe. Re-IDing would make a SECOND edit of
              // the same projected event miss `isPersistedActual`
              // (which checks the original projected id) and fall
              // into this branch again, duplicating the extra.
              setExtras((prev) => [...prev, event]);
            }
          } else {
            setExtras((prev) => [...prev, event]);
          }
          setDrawer({ open: false });
        }}
        onCancel={() => setDrawer({ open: false })}
        onDelete={(event) => {
          if (
            drawer.open &&
            drawer.mode === "edit" &&
            !extras.some((e) => e.id === drawer.event.id)
          ) {
            setDrawer({ open: false });
            return;
          }
          setExtras((prev) => prev.filter((e) => e.id !== event.id));
          setDrawer({ open: false });
        }}
      />
    </div>
  );
}
