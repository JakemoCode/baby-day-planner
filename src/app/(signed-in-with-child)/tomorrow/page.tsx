"use client";

import { useMemo, useState } from "react";
import type { Day, Event, OwnerRef, OwnershipTemplate } from "@/v3/schemas";
import { NO_OWNER, isNoOwner } from "@/v3/schemas";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { useV3Templates } from "@/v3/hooks/useV3Templates";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { LoadingState } from "@/components/shared/LoadingState";
import { FAB } from "@/components/shared/FAB";
import { FABTypePicker } from "@/components/shared/FABTypePicker";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { EventEditDrawerV3 } from "@/v3/components/shared/EventEditDrawerV3";
import { OwnerPickerV3 } from "@/v3/components/shared/OwnerPickerV3";
import {
  buildCreateTemplate,
  type CreatableType,
} from "@/v3/components/shared/createEventTemplate";
import { TomorrowForm } from "@/v3/components/Tomorrow/TomorrowForm";
import { TomorrowPreview } from "@/v3/components/Tomorrow/TomorrowPreview";
import { ActionButton } from "@/v3/components/Dashboard/ActionButton";
import { useDrawer } from "@/v3/hooks/useDrawer";
import { useTomorrowPlanState } from "@/v3/hooks/useTomorrowPlanState";
import styles from "./page.module.css";
import { useCurrentChild } from "@/v3/context/ChildProvider";

// Anchor the Tomorrow page's "now" to noon so create-templates and
// drawer constraints land in the middle of the planned day rather
// than wherever the user happens to be browsing from.
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

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedEvent, setPickedEvent] = useState<Event | null>(null);
  const [promoteConfirmOpen, setPromoteConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Plan state — load + autosave + actions. Settings must be present
  // before this can be set up (we read defaultWakeTime as the baseline).
  // Render the loading state path below before invoking the hook to
  // satisfy that contract.
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
      pickerOpen={pickerOpen}
      setPickerOpen={setPickerOpen}
      pickedEvent={pickedEvent}
      setPickedEvent={setPickedEvent}
      promoteConfirmOpen={promoteConfirmOpen}
      setPromoteConfirmOpen={setPromoteConfirmOpen}
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
  pickerOpen: boolean;
  setPickerOpen: (v: boolean) => void;
  pickedEvent: Event | null;
  setPickedEvent: (e: Event | null) => void;
  promoteConfirmOpen: boolean;
  setPromoteConfirmOpen: (v: boolean) => void;
  clearConfirmOpen: boolean;
  setClearConfirmOpen: (v: boolean) => void;
};

function TomorrowPageInner({
  childId,
  tomorrowDate,
  settings,
  templates,
  pickerOpen,
  setPickerOpen,
  pickedEvent,
  setPickedEvent,
  promoteConfirmOpen,
  setPromoteConfirmOpen,
  clearConfirmOpen,
  setClearConfirmOpen,
}: TomorrowPageInnerProps) {
  const planState = useTomorrowPlanState(childId, tomorrowDate, settings);

  const { drawer, openCreate, openEdit, close, onSave, onDelete } = useDrawer(
    planState.extras,
    (event) => planState.upsertExtra(event),
    (eventId) => planState.removeExtra(eventId),
  );

  const tomorrowDay = useMemo<Day>(() => {
    const day: Day = {
      id: `tomorrow-${tomorrowDate}`,
      childId,
      date: tomorrowDate,
      status: "planned",
      wakeTime: planState.wakeTime,
      suppressedRecurringIds: [],
      suppressedDaycareDay: false,
    };
    if (planState.templateId) day.templateId = planState.templateId;
    return day;
  }, [planState.wakeTime, planState.templateId, childId, tomorrowDate]);

  const selectedTemplate = useMemo<OwnershipTemplate | undefined>(() => {
    if (!planState.templateId) return undefined;
    return templates.find((t) => t.id === planState.templateId);
  }, [planState.templateId, templates]);

  const handlePromoteNow = async () => {
    setPromoteConfirmOpen(false);
    await planState.promoteNow();
  };

  const handleClear = async () => {
    setClearConfirmOpen(false);
    await planState.clear();
  };

  // §F12 PR 3 / F46 — chip tap → owner picker that writes to
  // plan.ownerOverrides. Replaces the prior TemplateOwnerPicker path
  // (which wrote to the underlying template, not the plan). Time
  // edits on projected non-extras aren't supported yet — TomorrowPlan
  // doesn't carry per-event time overrides; tracked as a follow-up.
  const handleOwnerOverrideChange = (event: Event, owner: OwnerRef | undefined) => {
    // `undefined` from OwnerPickerV3 means "no selection" — treat as
    // explicit NO_OWNER (the documented schema convention: `null` in
    // the ownerOverrides map = the user un-assigned this slot).
    if (owner === undefined || isNoOwner(owner)) {
      planState.setOwnerOverride(event.eventKey, null);
    } else {
      planState.setOwnerOverride(event.eventKey, owner);
    }
    setPickedEvent(null);
  };

  const ownerForPicked = (event: Event): OwnerRef => {
    const override = planState.ownerOverrides[event.eventKey];
    if (override !== undefined) return override ?? NO_OWNER;
    return event.owner ?? NO_OWNER;
  };

  const handleAddEvent = (type: CreatableType) => {
    const tpl = buildCreateTemplate({
      type,
      dayId: tomorrowDay.id,
      actuals: planState.extras,
      settings,
      nowMinutes: TOMORROW_ANCHOR_MINUTES,
    });
    openCreate(tpl);
  };

  // The promote button is only useful when there's actual plan content
  // to push to today — i.e. a confirmed plan or a draft with edits.
  const canPromoteNow = planState.plan !== null;

  return (
    <div className={styles.page}>
      {/* §F12 PR 3: Promote-to-today CTA at TOP of the page (Jake's
          2026-05-21 direction). Lives above the Plan section with
          helper text so the destructive nature is visible before the
          user has scrolled past their plan. */}
      <section className={styles.section}>
        <ActionButton
          variant="primary"
          onClick={() => setPromoteConfirmOpen(true)}
          disabled={!canPromoteNow}
        >
          Promote to today
        </ActionButton>
        <p className={styles.helperText}>
          Takes effect immediately and overrides anything currently saved in Today.
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.statusRow}>
          <span className={styles.statusPill} data-status={planState.status}>
            {STATUS_LABEL[planState.status]}
          </span>
        </div>
        <h2 className={styles.sectionTitle}>Plan</h2>
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
              // Extras get the full drawer — owner + time + label.
              openEdit(event);
              return;
            }
            // §F46 — projected non-extras get an owner picker that
            // writes to plan.ownerOverrides[eventKey]. Time edits on
            // projected events aren't a thing on /tomorrow; the cascade
            // owns event timing. No template-selected gating.
            setPickedEvent(event);
          }}
        />
      </section>

      <section className={styles.section}>
        <div className={styles.planActions}>
          <ActionButton
            variant="secondary"
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
        </div>
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

      <FAB label="Add an event" onClick={() => setPickerOpen(true)} />

      <FABTypePicker
        open={pickerOpen}
        onSelect={(type: CreatableType) => {
          setPickerOpen(false);
          handleAddEvent(type);
        }}
        onCancel={() => setPickerOpen(false)}
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
        existingEvents={planState.extras}
        open={drawer.open}
        event={drawer.open ? (drawer.mode === "edit" ? drawer.event : drawer.template) : null}
        mode={drawer.open && drawer.mode === "edit" ? "edit" : "create"}
        onSave={onSave}
        onCancel={close}
        onDelete={onDelete}
      />

      <ConfirmDialog
        open={promoteConfirmOpen}
        title="Promote to today?"
        body="Today's day will be archived and replaced with this plan. Any recorded events for today will be archived alongside it."
        confirmLabel="Promote"
        cancelLabel="Cancel"
        onConfirm={() => void handlePromoteNow()}
        onCancel={() => setPromoteConfirmOpen(false)}
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
