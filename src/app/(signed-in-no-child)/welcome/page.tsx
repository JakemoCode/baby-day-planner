"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, writeBatch } from "firebase/firestore";
import { useAuth } from "@/lib/auth/useAuth";
import { db } from "@/lib/firebase/client";
import { CHILDREN, childPath, dayPath, settingsPath, userPath } from "@/lib/firestore/paths";
import {
  v3ChildConverter,
  v3DayConverter,
  v3SettingsConverter,
  v3UserConverter,
} from "@/v3/firestore/converters";
import { makeDefaultSettings } from "@/v3/firestore/settingsDefaults";
import { deterministicDayId } from "@/v3/repositories/days";
import { TomorrowPreview } from "@/v3/components/Tomorrow/TomorrowPreview";
import { OwnerPickerV3 } from "@/v3/components/shared/OwnerPickerV3";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { NO_OWNER, isNoOwner } from "@/v3/schemas";
import type { Day, Event, OwnerRef, Settings } from "@/v3/schemas";
import { currentLocalDate } from "@/v3/ui/time";
import { ownerOverrideKeyFor } from "@/v3/lib/eventConventions";
import styles from "./page.module.css";

type Step = 1 | 2 | 3;

function minutesFromTimeInput(value: string): number {
  // Guard against NaN from Safari edge cases — `defaultWakeTime: NaN` corrupts downstream projections.
  const [hRaw, mRaw] = value.split(":");
  const h = Number.parseInt(hRaw ?? "", 10);
  const m = Number.parseInt(mRaw ?? "", 10);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * Three-step onboarding flow: (1) child identity, (2) owner names + wake time, (3) first-day preview with owner assignment.
 * Commits a 4-doc writeBatch (Child, Settings, User, Day 1) then redirects to /.
 */
export default function WelcomePage() {
  const { user } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [displayName, setDisplayName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [parent1Name, setParent1Name] = useState("");
  const [parent2Name, setParent2Name] = useState("");
  const [wakeTimeStr, setWakeTimeStr] = useState("07:00");
  const [ownerOverrides, setOwnerOverrides] = useState<Record<string, OwnerRef | null>>({});
  const [pickedEvent, setPickedEvent] = useState<Event | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function nextStep(e: FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !dateOfBirth) return;
    setStep(2);
  }

  function nextStepToPreview(e: FormEvent) {
    e.preventDefault();
    if (!parent1Name.trim()) return;
    setStep(3);
  }

  // Settings projection for the Step-3 preview — reflects form state so owner names appear live.
  const previewSettings: Settings | null = useMemo(() => {
    if (step !== 3) return null;
    const wakeMin = minutesFromTimeInput(wakeTimeStr);
    const defaults = makeDefaultSettings("preview");
    return {
      ...defaults,
      defaultWakeTime: wakeMin,
      owners: {
        parent1: { displayName: parent1Name.trim() || "Parent 1" },
        parent2: { displayName: parent2Name.trim() || "Parent 2" },
        other: [],
      },
    };
  }, [step, wakeTimeStr, parent1Name, parent2Name]);

  const previewDay: Day | null = useMemo(() => {
    if (!previewSettings) return null;
    return {
      id: "preview-day",
      childId: "preview",
      date: currentLocalDate(),
      status: "active",
      wakeTime: previewSettings.defaultWakeTime,
      suppressedRecurringIds: [],
      suppressedDaycareDay: false,
      suppressedDreamFeed: false,
      ownerOverrides,
    };
  }, [previewSettings, ownerOverrides]);

  const handleOwnerOverrideChange = (event: Event, owner: OwnerRef | undefined) => {
    const key = ownerOverrideKeyFor(event); // bottles → positional key (§F66)
    if (owner === undefined || isNoOwner(owner)) {
      setOwnerOverrides((prev) => ({ ...prev, [key]: null }));
    } else {
      setOwnerOverrides((prev) => ({ ...prev, [key]: owner }));
    }
    setPickedEvent(null);
  };

  const ownerForPicked = (event: Event): OwnerRef => {
    const override = ownerOverrides[ownerOverrideKeyFor(event)];
    if (override !== undefined) return override ?? NO_OWNER;
    return event.owner ?? NO_OWNER;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const newId = doc(collection(db, CHILDREN)).id;
      const now = Date.now();
      const wakeMin = minutesFromTimeInput(wakeTimeStr);

      const settings = {
        ...makeDefaultSettings(newId),
        defaultWakeTime: wakeMin,
        owners: {
          parent1: { displayName: parent1Name.trim() || "Parent 1" },
          parent2: { displayName: parent2Name.trim() || "Parent 2" },
          other: [] as Array<{ id: string; displayName: string; color?: string }>,
        },
      };

      const today = currentLocalDate();
      const dayDocId = deterministicDayId(newId, today);
      const day1: Day = {
        id: dayDocId,
        childId: newId,
        date: today,
        status: "active",
        wakeTime: wakeMin,
        suppressedRecurringIds: [],
        suppressedDaycareDay: false,
        suppressedDreamFeed: false,
        ...(Object.keys(ownerOverrides).length > 0 ? { ownerOverrides } : {}),
      };

      // Atomic write — partial failure cannot leave orphans or an empty dashboard.
      const batch = writeBatch(db);
      batch.set(doc(db, childPath(newId)).withConverter(v3ChildConverter), {
        id: newId,
        displayName: displayName.trim(),
        dateOfBirth,
        createdAt: now,
        createdBy: user.uid,
      });
      batch.set(doc(db, settingsPath(newId)).withConverter(v3SettingsConverter), settings);
      batch.set(doc(db, userPath(user.uid)).withConverter(v3UserConverter), {
        uid: user.uid,
        childIds: [newId],
        createdAt: now,
      });
      batch.set(doc(db, dayPath(newId, dayDocId)).withConverter(v3DayConverter), day1);
      await batch.commit();

      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      {step === 1 && (
        <form className={styles.form} onSubmit={nextStep}>
          <h1 className={styles.cardHeading}>Welcome to Baby Day Planner</h1>
          <p className={styles.eyebrow}>First time setup · Step 1 of 3</p>
          <hr className={styles.divider} />
          <label className={styles.field}>
            <span>Child&apos;s name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoFocus
              required
              aria-label="Child's name"
            />
          </label>
          <label className={styles.field}>
            <span>Date of birth</span>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              required
              max={new Date().toISOString().slice(0, 10)}
              aria-label="Date of birth"
            />
          </label>
          <button type="submit" className={`${styles.button} ${styles.primary}`}>
            Next
          </button>
        </form>
      )}
      {step === 2 && (
        <form className={styles.form} onSubmit={nextStepToPreview}>
          <h1 className={styles.cardHeading}>Almost there</h1>
          <p className={styles.eyebrow}>First time setup · Step 2 of 3</p>
          <hr className={styles.divider} />
          <label className={styles.field}>
            <span>Parent 1 name</span>
            <input
              type="text"
              value={parent1Name}
              onChange={(e) => setParent1Name(e.target.value)}
              placeholder="e.g. Jake"
              required
              aria-label="Parent 1 name"
            />
          </label>
          <label className={styles.field}>
            <span>
              Parent 2 name <span className={styles.optional}>(optional)</span>
            </span>
            <input
              type="text"
              value={parent2Name}
              onChange={(e) => setParent2Name(e.target.value)}
              placeholder="e.g. Kelly"
              aria-label="Parent 2 name"
            />
          </label>
          <label className={styles.field}>
            <span>Default wake time</span>
            <input
              type="time"
              value={wakeTimeStr}
              onChange={(e) => setWakeTimeStr(e.target.value)}
              required
              aria-label="Default wake time"
            />
            <small>
              You can tune nap length, bedtime threshold, and wake windows later in Settings.
            </small>
          </label>
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.button} ${styles.secondary}`}
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button type="submit" className={`${styles.button} ${styles.primary}`}>
              Next
            </button>
          </div>
        </form>
      )}
      {step === 3 && previewSettings && previewDay && (
        <form className={styles.form} onSubmit={submit}>
          <h1 className={styles.cardHeading}>Your first day</h1>
          <p className={styles.eyebrow}>First time setup · Step 3 of 3</p>
          <hr className={styles.divider} />
          <p className={styles.helperText}>
            Tap any chip to assign an owner — or skip; assignments can be edited later from the
            timeline.
          </p>

          {/* Actions above the preview so the primary CTA is visible without scrolling. */}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.button} ${styles.secondary}`}
              onClick={() => setStep(2)}
            >
              Back
            </button>
            <button
              type="submit"
              className={`${styles.button} ${styles.primary}`}
              disabled={submitting}
            >
              {submitting ? "Saving…" : "Start tracking"}
            </button>
          </div>

          <TomorrowPreview
            day={previewDay}
            settings={previewSettings}
            owners={previewSettings.owners}
            extras={[]}
            onEventTap={(event) => {
              if (event.type === "extra") return;
              setPickedEvent(event);
            }}
          />
        </form>
      )}

      {pickedEvent && previewSettings && (
        <BottomSheet
          open
          title={`Owner for ${pickedEvent.label}`}
          onCancel={() => setPickedEvent(null)}
        >
          <OwnerPickerV3
            owners={previewSettings.owners}
            value={ownerForPicked(pickedEvent)}
            onChange={(owner) => handleOwnerOverrideChange(pickedEvent, owner)}
            label={pickedEvent.label}
          />
        </BottomSheet>
      )}
    </div>
  );
}
