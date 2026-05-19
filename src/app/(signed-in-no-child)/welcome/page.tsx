"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, writeBatch } from "firebase/firestore";
import { useAuth } from "@/lib/auth/useAuth";
import { db } from "@/lib/firebase/client";
import { CHILDREN, childPath, settingsPath, userPath } from "@/lib/firestore/paths";
import { v3ChildConverter, v3SettingsConverter, v3UserConverter } from "@/v3/firestore/converters";
import { withV3SettingsDefaults } from "@/v3/firestore/settingsDefaults";
import styles from "./page.module.css";

type Step = 1 | 2;

function minutesFromTimeInput(value: string): number {
  // "07:00" → 420. `<input type="time" required>` enforces HH:MM, but parseInt
  // can still yield NaN on Safari edge cases — guard with isFinite so we never
  // persist `defaultWakeTime: NaN` and corrupt every downstream projection.
  const [hRaw, mRaw] = value.split(":");
  const h = Number.parseInt(hRaw ?? "", 10);
  const m = Number.parseInt(mRaw ?? "", 10);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * §F3 + §F10 onboarding flow.
 *
 * Step 1 — child identity (displayName + DOB)
 * Step 2 — co-parent identity (parent1/parent2 names) + defaultWakeTime
 *
 * Submit writes three docs in sequence:
 *   1. /children/{newId}                    (Child doc)
 *   2. /children/{newId}/settings/current   (Settings, defaulted via withV3SettingsDefaults)
 *   3. /users/{uid}                          (User with childIds: [newId])
 *
 * Then router.push("/") — the (signed-in-with-child) layout's resolution
 * picks up the new docs and renders the dashboard.
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function nextStep(e: FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !dateOfBirth) return;
    setStep(2);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const newId = doc(collection(db, CHILDREN)).id;
      const now = Date.now();

      const settings = withV3SettingsDefaults({
        childId: newId,
        defaultWakeTime: minutesFromTimeInput(wakeTimeStr),
        owners: {
          parent1: { displayName: parent1Name.trim() || "Parent 1", color: "#0ab" },
          parent2: { displayName: parent2Name.trim() || "Parent 2", color: "#f64" },
          other: [],
        },
      })!;

      // Atomic 3-doc write so a partial failure can never leave orphaned
      // Child/Settings docs unreachable from any /users/{uid}.
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
      await batch.commit();

      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Welcome to Baby Day Planner</h1>
      {step === 1 && (
        <form className={styles.form} onSubmit={nextStep}>
          <p className={styles.eyebrow}>First time setup · Step 1 of 2</p>
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
        <form className={styles.form} onSubmit={submit}>
          <p className={styles.eyebrow}>First time setup · Step 2 of 2</p>
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
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.button} ${styles.secondary}`}
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button
              type="submit"
              className={`${styles.button} ${styles.primary}`}
              disabled={submitting}
            >
              {submitting ? "Saving…" : "Get started"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
