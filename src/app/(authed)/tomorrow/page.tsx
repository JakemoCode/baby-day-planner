"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Day, Event, Owner, OwnershipTemplate } from "@/domain";
import { useSettings } from "@/hooks/useSettings";
import { useTemplates } from "@/hooks/useTemplates";
import { startNewDay } from "@/repositories/startNewDay";
import { saveTemplate } from "@/repositories/templates";
import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import { EventEditDrawer } from "@/components/shared/EventEditDrawer";
import { buildCreateTemplate } from "@/components/shared/createEventTemplate";
import { TomorrowForm, type TomorrowFormState } from "@/components/Tomorrow/TomorrowForm";
import { TomorrowPreview } from "@/components/Tomorrow/TomorrowPreview";
import { PromoteTomorrowButton } from "@/components/Tomorrow/PromoteTomorrowButton";
import { TemplateOwnerPicker } from "@/components/DayTemplates/TemplateOwnerPicker";
import { ASSIGNABLE_TYPES, setOwnerInTemplate } from "@/components/DayTemplates/setOwnerInTemplate";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

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
  const { settings, loading: settingsLoading } = useSettings(CHILD_ID);
  const { templates } = useTemplates(CHILD_ID);

  const [form, setForm] = useState<TomorrowFormState>({
    wakeTime: "07:00",
    extras: [],
  });
  const [drawer, setDrawer] = useState<DrawerState>({ open: false });
  const [pickedEvent, setPickedEvent] = useState<Event | null>(null);
  // Local override of the selected template so owner edits in the preview
  // reflect immediately without waiting for the listener round-trip.
  const [templateOverride, setTemplateOverride] = useState<OwnershipTemplate | null>(null);

  const tomorrowDay = useMemo<Day>(() => {
    const day: Day = {
      id: `tomorrow-${tomorrowDateString()}`,
      childId: CHILD_ID,
      date: tomorrowDateString(),
      status: "planned",
      wakeTime: form.wakeTime,
      createdAt: new Date().toISOString(),
    };
    if (form.templateId) day.ownershipTemplateId = form.templateId;
    return day;
  }, [form.wakeTime, form.templateId]);

  const selectedTemplate = useMemo<OwnershipTemplate | undefined>(() => {
    if (!form.templateId) return undefined;
    if (templateOverride && templateOverride.id === form.templateId) return templateOverride;
    return templates.find((t) => t.id === form.templateId);
  }, [form.templateId, templates, templateOverride]);

  if (settingsLoading || !settings) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading settings" />
      </div>
    );
  }

  const handlePromote = async () => {
    const now = new Date().toISOString();
    await startNewDay(db, CHILD_ID, {
      newDayId: `day-${Date.now()}`,
      newDate: tomorrowDateString(),
      newWakeTime: form.wakeTime,
      ...(form.templateId ? { ownershipTemplateId: form.templateId } : {}),
      now,
    });
    router.replace("/");
  };

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Plan</h2>
        <TomorrowForm
          value={form}
          templates={templates}
          onChange={setForm}
          onAddExtra={() => {
            const tpl = buildCreateTemplate({
              type: "extra",
              dayId: tomorrowDay.id,
              actuals: form.extras,
              settings,
              nowHHMM: "12:00",
            });
            setDrawer({ open: true, mode: "create", template: tpl });
          }}
          onEditExtra={(event) => setDrawer({ open: true, mode: "edit", event })}
          onRemoveExtra={(id) =>
            setForm({ ...form, extras: form.extras.filter((e) => e.id !== id) })
          }
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Preview</h2>
        <TomorrowPreview
          day={tomorrowDay}
          settings={settings}
          {...(selectedTemplate ? { template: selectedTemplate } : {})}
          extras={form.extras}
          {...(form.bottle1Time ? { bottle1Time: form.bottle1Time } : {})}
          onEventTap={(event) => {
            if (event.type === "extra") {
              setDrawer({ open: true, mode: "edit", event });
              return;
            }
            if (!ASSIGNABLE_TYPES.includes(event.type)) return;
            if (!selectedTemplate) return; // need a template to write owners into
            setPickedEvent(event);
          }}
        />
      </section>

      <PromoteTomorrowButton onPromote={handlePromote} disabled={!form.wakeTime} />

      {pickedEvent && selectedTemplate && (
        <TemplateOwnerPicker
          event={pickedEvent}
          onSelect={(owner: Owner) => {
            const next = setOwnerInTemplate(selectedTemplate, pickedEvent, owner);
            setTemplateOverride(next);
            setPickedEvent(null);
            void saveTemplate(db, CHILD_ID, next);
          }}
          onCancel={() => setPickedEvent(null)}
        />
      )}

      <EventEditDrawer
        key={
          drawer.open && drawer.mode === "edit"
            ? drawer.event.id
            : drawer.open && drawer.mode === "create"
              ? drawer.template.id
              : "closed"
        }
        open={drawer.open}
        event={drawer.open ? (drawer.mode === "edit" ? drawer.event : drawer.template) : null}
        mode={drawer.open && drawer.mode === "edit" ? "edit" : "create"}
        onSave={(event) => {
          setForm((prev) => {
            const others = prev.extras.filter((e) => e.id !== event.id);
            return { ...prev, extras: [...others, event] };
          });
          setDrawer({ open: false });
        }}
        onCancel={() => setDrawer({ open: false })}
        onDelete={(event) => {
          setForm((prev) => ({
            ...prev,
            extras: prev.extras.filter((e) => e.id !== event.id),
          }));
          setDrawer({ open: false });
        }}
      />
    </div>
  );
}
