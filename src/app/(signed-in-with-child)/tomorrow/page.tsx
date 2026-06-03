"use client";

import { useMemo, useState } from "react";
import type { Day, Event, OwnerRef, OwnershipTemplate } from "@/v3/schemas";
import { NO_OWNER, isNoOwner } from "@/v3/schemas";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { useV3Templates } from "@/v3/hooks/useV3Templates";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { LoadingState } from "@/components/shared/LoadingState";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { EventEditDrawerV3 } from "@/v3/components/shared/EventEditDrawerV3";
import { OwnerPickerV3 } from "@/v3/components/shared/OwnerPickerV3";
import { AddEventFAB } from "@/v3/components/shared/AddEventFAB";
import { TomorrowForm } from "@/v3/components/Tomorrow/TomorrowForm";
import { TomorrowPreview } from "@/v3/components/Tomorrow/TomorrowPreview";
import { ActionButton } from "@/v3/components/Dashboard/ActionButton";
import { useDrawer } from "@/v3/hooks/useDrawer";
import { useTomorrowPlanState } from "@/v3/hooks/useTomorrowPlanState";
import styles from "./page.module.css";
import { useCurrentChild } from "@/v3/context/ChildProvider";
import { ownerOverrideKeyFor } from "@/v3/lib/eventConventions";

// Anchors "now" to noon so drawer constraints land mid-day regardless of wall-clock time.
const TOMORROW_ANCHOR_MINUTES = 12 * 60;

function tomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STATUS_LABEL: Record<"no-plan" | "draft" | "confirmed", string> = {
  "no-plan": "No plan yet",
  draft: "Draft",
  confirmed: "Confirmed — will auto-apply at midnight",
};

export default function TomorrowPage() {
  const CHILD_ID = useCurrentChild().id;
  const TOMORROW = tomorrowDateString();
  const { settings, loading: settingsLoading } = useV3Settings(CHILD_ID);
  const { templates, loading: templatesLoading } = useV3Templates(CHILD_ID);

  const [pickedEvent, setPickedEvent] = useState<Event | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Settings required before hook setup (reads defaultWakeTime as baseline).
  if (settingsLoading || !settings || templatesLoading) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading tomorrow" />
      </div>
    );
  }

  return (
    <TomorrowPageInner
      childId={CHILD_ID}
      tomorrowDate={TOMORROW}
      settings={settings}
      templates={templates}
      pickedEvent={pickedEvent}
      setPickedEvent={setPickedEvent}
      clearConfirmOpen={clearConfirmOpen}
      setClearConfirmOpen={setClearConfirmOpen}
    />
  );
}

type TomorrowPageInnerProps = {
  childId: string;
  tomorrowDate: string;
  settings: NonNullable<ReturnType<typeof useV3Settings>["settings"]>;
  templates: ReturnType<typeof useV3Templates>["templates"];
  pickedEvent: Event | null;
  setPickedEvent: (e: Event | null) => void;
  clearConfirmOpen: boolean;
  setClearConfirmOpen: (v: boolean) => void;
};

function TomorrowPageInner({
  childId,
  tomorrowDate,
  settings,
  templates,
  pickedEvent,
  setPickedEvent,
  clearConfirmOpen,
  setClearConfirmOpen,
}: TomorrowPageInnerProps) {
  const planState = useTomorrowPlanState(childId, tomorrowDate, settings);

  const { drawer, openCreate, openEdit, close, onSave, onDelete } = useDrawer({
    saveEvent: (event) => planState.upsertExtra(event),
    deleteOptimistic: (eventId) => planState.removeExtra(eventId),
  });

  const tomorrowDay = useMemo<Day>(() => {
    const day: Day = {
      id: `tomorrow-${tomorrowDate}`,
      childId,
      date: tomorrowDate,
      status: "planned",
      wakeTime: planState.wakeTime,
      suppressedRecurringIds: [],
      suppressedDaycareDay: false,
      suppressedDreamFeed: false,
    };
    if (planState.templateId) day.templateId = planState.templateId;
    // Preview Day must carry ownerOverrides so the engine applies them when projecting.
    if (Object.keys(planState.ownerOverrides).length > 0) {
      day.ownerOverrides = planState.ownerOverrides;
    }
    return day;
  }, [planState.wakeTime, planState.templateId, planState.ownerOverrides, childId, tomorrowDate]);

  const selectedTemplate = useMemo<OwnershipTemplate | undefined>(() => {
    if (!planState.templateId) return undefined;
    return templates.find((t) => t.id === planState.templateId);
  }, [planState.templateId, templates]);

  const handleClear = async () => {
    setClearConfirmOpen(false);
    await planState.clear();
  };

  // Chip-tap handler: writes to plan.ownerOverrides. undefined/NO_OWNER → null in the map (un-assigned).
  const handleOwnerOverrideChange = (event: Event, owner: OwnerRef | undefined) => {
    const key = ownerOverrideKeyFor(event); // bottles → positional key (§F66)
    if (owner === undefined || isNoOwner(owner)) {
      planState.setOwnerOverride(key, null);
    } else {
      planState.setOwnerOverride(key, owner);
    }
    setPickedEvent(null);
  };

  const ownerForPicked = (event: Event): OwnerRef => {
    const override = planState.ownerOverrides[ownerOverrideKeyFor(event)];
    if (override !== undefined) return override ?? NO_OWNER;
    return event.owner ?? NO_OWNER;
  };

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <div className={styles.planHeader}>
          <h2 className={styles.sectionTitle}>Plan</h2>
          <span className={styles.statusPill} data-status={planState.status}>
            {STATUS_LABEL[planState.status]}
          </span>
        </div>
        <TomorrowForm
          value={{
            wakeTime: planState.wakeTime,
            ...(planState.templateId !== undefined ? { templateId: planState.templateId } : {}),
          }}
          templates={templates}
          onChange={(next) => {
            planState.setWakeTime(next.wakeTime);
            planState.setTemplateId(next.templateId);
          }}
        />
        <div className={styles.planActions}>
          <ActionButton
            variant="primary"
            onClick={() => void planState.confirm()}
            disabled={!planState.hasEdits || planState.status === "confirmed"}
          >
            Confirm plan
          </ActionButton>
          <ActionButton
            variant="danger"
            onClick={() => setClearConfirmOpen(true)}
            disabled={planState.plan === null}
          >
            Clear plan
          </ActionButton>
          {process.env.NODE_ENV === "development" && (
            <ActionButton
              variant="secondary"
              onClick={() => void planState.promoteNow()}
              disabled={planState.plan === null}
            >
              Promote now (dev)
            </ActionButton>
          )}
        </div>
        <p className={styles.helperText}>
          Confirmed plans apply automatically when tomorrow begins.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Preview</h2>
        <TomorrowPreview
          day={tomorrowDay}
          settings={settings}
          owners={settings.owners}
          {...(selectedTemplate ? { template: selectedTemplate } : {})}
          extras={planState.extras}
          onEventTap={(event) => {
            if (event.type === "extra") {
              openEdit(event);
              return;
            }
            // Non-extras get the owner picker (writes to ownerOverrides); time edits unsupported.
            setPickedEvent(event);
          }}
        />
      </section>

      {pickedEvent && (
        <BottomSheet
          open
          title={`Owner for ${pickedEvent.label}`}
          onCancel={() => setPickedEvent(null)}
        >
          <OwnerPickerV3
            owners={settings.owners}
            value={ownerForPicked(pickedEvent)}
            onChange={(owner) => handleOwnerOverrideChange(pickedEvent, owner)}
            label={pickedEvent.label}
          />
        </BottomSheet>
      )}

      <AddEventFAB
        dayId={tomorrowDay.id}
        actuals={planState.extras}
        settings={settings}
        nowMinutes={TOMORROW_ANCHOR_MINUTES}
        types={["extra"]}
        onCreate={openCreate}
      />

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
        napDurationMin={settings.napDurationMin}
        existingEvents={planState.extras}
        open={drawer.open}
        event={drawer.open ? (drawer.mode === "edit" ? drawer.event : drawer.template) : null}
        mode={drawer.open && drawer.mode === "edit" ? "edit" : "create"}
        onSave={onSave}
        onCancel={close}
        onDelete={onDelete}
      />

      <ConfirmDialog
        open={clearConfirmOpen}
        title="Clear this plan?"
        body="The draft / confirmed plan for tomorrow will be deleted. You can start over from scratch."
        confirmLabel="Clear"
        cancelLabel="Cancel"
        onConfirm={() => void handleClear()}
        onCancel={() => setClearConfirmOpen(false)}
      />
    </div>
  );
}
