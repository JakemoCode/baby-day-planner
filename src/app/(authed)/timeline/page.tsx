"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Event, OwnershipTemplate } from "@/domain";
import { projectDay } from "@/domain";
import { useDay } from "@/hooks/useDay";
import { useEvents } from "@/hooks/useEvents";
import { useNowMinutes } from "@/hooks/useNowMinutes";
import { useSettings } from "@/hooks/useSettings";
import { useTemplates } from "@/hooks/useTemplates";
import { LoadingState } from "@/components/shared/LoadingState";
import { EmptyState } from "@/components/shared/EmptyState";
import { FAB } from "@/components/shared/FAB";
import { FABTypePicker } from "@/components/shared/FABTypePicker";
import { EventEditDrawer } from "@/components/shared/EventEditDrawer";
import { buildCreateTemplate, type CreatableType } from "@/components/shared/createEventTemplate";
import { TimelineList } from "@/components/Timeline/TimelineList";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

type DrawerState =
  | { open: false }
  | { open: true; mode: "create"; template: Event }
  | { open: true; mode: "edit"; event: Event };

function yesterdayDate(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() - 1);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export default function TimelinePage() {
  const nowMinutes = useNowMinutes();
  const { day, loading: dayLoading } = useDay(CHILD_ID);
  const { settings, loading: settingsLoading } = useSettings(CHILD_ID);
  const {
    events: actuals,
    createOptimistic,
    updateOptimistic,
    deleteOptimistic,
  } = useEvents(CHILD_ID, day?.id ?? "");
  const { templates } = useTemplates(CHILD_ID);
  const [drawer, setDrawer] = useState<DrawerState>({ open: false });
  const [pickerOpen, setPickerOpen] = useState(false);

  const template = useMemo<OwnershipTemplate | undefined>(() => {
    if (!day?.ownershipTemplateId) return undefined;
    return templates.find((t) => t.id === day.ownershipTemplateId);
  }, [day, templates]);

  const projected = useMemo(() => {
    if (!day || !settings) return [];
    return projectDay({
      day,
      settings,
      actuals,
      ...(template ? { template } : {}),
      nowMinutes,
    });
  }, [day, settings, actuals, template, nowMinutes]);

  if (dayLoading || settingsLoading) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading timeline" />
      </div>
    );
  }

  if (!day || !settings) {
    return (
      <div className={styles.page}>
        <EmptyState title="No active day" body="Start a new day from the dashboard." />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={`/history/${yesterdayDate(day.date)}`} className={styles.backLink}>
          ← Yesterday
        </Link>
      </header>

      <TimelineList
        events={projected}
        nowMinutes={nowMinutes}
        scrollToNowOnMount
        onEventTap={(event) => setDrawer({ open: true, mode: "edit", event })}
      />

      <FAB label="Add an event" onClick={() => setPickerOpen(true)} />

      <FABTypePicker
        open={pickerOpen}
        onSelect={(type: CreatableType) => {
          setPickerOpen(false);
          const tpl = buildCreateTemplate({
            type,
            dayId: day.id,
            actuals,
            settings,
            nowHHMM: formatNowAsHHMM(nowMinutes),
          });
          setDrawer({ open: true, mode: "create", template: tpl });
        }}
        onCancel={() => setPickerOpen(false)}
      />

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
        onSave={async (event) => {
          if (drawer.open && drawer.mode === "edit") {
            // Projected events are synthesized by the engine and have no
            // Firestore doc — the first edit needs to CREATE the override,
            // not update a non-existent record. Give it a fresh id so we
            // don't write under the synthetic "proj-…" key.
            if (drawer.event.source === "projected") {
              await createOptimistic({ ...event, id: `manual-${Date.now()}` });
            } else {
              await updateOptimistic(event.id, event);
            }
          } else {
            await createOptimistic(event);
          }
          setDrawer({ open: false });
        }}
        onCancel={() => setDrawer({ open: false })}
        onDelete={async (event) => {
          // Same caveat — can't delete a projected event since it doesn't
          // exist in Firestore. Just close the drawer.
          if (drawer.open && drawer.mode === "edit" && drawer.event.source === "projected") {
            setDrawer({ open: false });
            return;
          }
          await deleteOptimistic(event.id);
          setDrawer({ open: false });
        }}
      />
    </div>
  );
}

function formatNowAsHHMM(nowMinutes: number): string {
  const h = Math.floor(nowMinutes / 60);
  const m = nowMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
