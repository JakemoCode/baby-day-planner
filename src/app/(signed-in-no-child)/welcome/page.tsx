"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { collection, doc } from "firebase/firestore";
import { useAuth } from "@/lib/auth/useAuth";
import { db } from "@/lib/firebase/client";
import { CHILDREN } from "@/lib/firestore/paths";
import { createChild } from "@/v3/repositories/children";
import { createUser } from "@/v3/repositories/users";
import { saveSettings } from "@/v3/repositories/settings";
import { withV3SettingsDefaults } from "@/v3/firestore/settingsDefaults";
import styles from "./page.module.css";

type Step = 1 | 2;

function minutesFromTimeInput(value: string): number {
  // "07:00" → 420
  const [h, m] = value.split(":").map((s) => parseInt(s, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

function timeInputFromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  const [parent1Name, setParent1Name] = useState("Parent 1");
  const [parent2Name, setParent2Name] = useState("Parent 2");
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

      await createChild(db, {
        id: newId,
        displayName: displayName.trim(),
        dateOfBirth,
        createdAt: now,
        createdBy: user.uid,
      });

      const settings = withV3SettingsDefaults({
        childId: newId,
        defaultWakeTime: minutesFromTimeInput(wakeTimeStr),
        owners: {
          parent1: { displayName: parent1Name.trim() || "Parent 1", color: "#0ab" },
          parent2: { displayName: parent2Name.trim() || "Parent 2", color: "#f64" },
          other: [],
        },
      })!;
      await saveSettings(db, newId, settings);

      await createUser(db, {
        uid: user.uid,
        childIds: [newId],
        createdAt: now,
      });

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
          <p className={styles.eyebrow}>Step 1 of 2 — Your child</p>
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
          <p className={styles.eyebrow}>Step 2 of 2 — Co-parents &amp; routine</p>
          <label className={styles.field}>
            <span>Parent 1 name</span>
            <input
              type="text"
              value={parent1Name}
              onChange={(e) => setParent1Name(e.target.value)}
              required
              aria-label="Parent 1 name"
            />
          </label>
          <label className={styles.field}>
            <span>Parent 2 name (optional)</span>
            <input
              type="text"
              value={parent2Name}
              onChange={(e) => setParent2Name(e.target.value)}
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

// Re-export for testability (lets RTL stable-import via @/-aliases).
export { timeInputFromMinutes };
