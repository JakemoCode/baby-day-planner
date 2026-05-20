/**
 * V3 days repository.
 *
 * Path-compatible with V2 (`children/{childId}/days/{dayId}`). Wire
 * shape: V3 Day has TimeMin `wakeTime` (number, optional) plus
 * `suppressedRecurringIds` and `suppressedDaycareDay`.
 *
 * `archiveDay` does NOT carry an `archivedAt` like V2. The engine
 * doesn't read it, and `Day.date` already gives chronological history
 * sort. If a future feature needs it, extend the V3 Day type and the
 * archive call together.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { dayPath, daysCollectionPath, eventsCollectionPath } from "@/lib/firestore/paths";
import { v3DayConverter, v3EventConverter } from "../firestore/converters";
import { reduceLifecycle } from "../lifecycle";
import type { Day, Event, TimeMin } from "../schemas";

function dayRef(db: Firestore, childId: string, dayId: string) {
  return doc(db, dayPath(childId, dayId)).withConverter(v3DayConverter);
}

function daysRef(db: Firestore, childId: string) {
  return collection(db, daysCollectionPath(childId)).withConverter(v3DayConverter);
}

export async function createDay(db: Firestore, day: Day): Promise<void> {
  await setDoc(dayRef(db, day.childId, day.id), day);
}

export async function getDay(db: Firestore, childId: string, dayId: string): Promise<Day | null> {
  const snap = await getDoc(dayRef(db, childId, dayId));
  return snap.exists() ? snap.data() : null;
}

export async function getDayByDate(
  db: Firestore,
  childId: string,
  date: string,
): Promise<Day | null> {
  const q = query(daysRef(db, childId), where("date", "==", date), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0]!.data();
}

/**
 * Get the day doc for the given calendar date, lazy-creating a
 * `planned` doc if none exists. Used by the bottle save-path to route
 * overnight feeds (§F22 + DOMAIN.md §2 "midnight rule") to the correct
 * calendar day without disturbing the active day.
 *
 * `planned` status (not `active`) so the caller's existing active-day
 * subscription isn't affected — the new doc only matters once the user
 * formally starts that day, at which point `startNewDay` flips it to
 * active. The lazy-created doc inherits `defaultWakeTime` from settings.
 */
export async function getOrCreatePlannedDay(
  db: Firestore,
  childId: string,
  date: string,
  defaultWakeTime: TimeMin,
): Promise<Day> {
  const existing = await getDayByDate(db, childId, date);
  if (existing) return existing;
  const newDay: Day = {
    id: `day-${date}-${Date.now()}`,
    childId,
    date,
    status: "planned",
    wakeTime: defaultWakeTime,
    suppressedRecurringIds: [],
    suppressedDaycareDay: false,
  };
  await setDoc(dayRef(db, childId, newDay.id), newDay);
  return newDay;
}

export async function archiveDay(db: Firestore, childId: string, dayId: string): Promise<void> {
  await updateDoc(dayRef(db, childId, dayId), { status: "archived" });
}

export async function updateDay(
  db: Firestore,
  childId: string,
  dayId: string,
  patch: Partial<Day>,
): Promise<void> {
  await updateDoc(dayRef(db, childId, dayId), patch);
}

export async function listArchivedDays(db: Firestore, childId: string, max = 7): Promise<Day[]> {
  const q = query(
    daysRef(db, childId),
    where("status", "==", "archived"),
    orderBy("date", "desc"),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export function watchActiveDay(
  db: Firestore,
  childId: string,
  cb: (day: Day | null) => void,
): () => void {
  const q = query(daysRef(db, childId), where("status", "==", "active"), limit(1));
  return onSnapshot(q, (snap) => {
    cb(snap.empty ? null : snap.docs[0]!.data());
  });
}

// ---------------------------------------------------------------------------
// startNewDay
// ---------------------------------------------------------------------------

export type StartNewDayInput = {
  newDayId: string;
  newDate: string;
  newWakeTime: TimeMin;
  templateId?: string;
};

export type StartNewDayResult = {
  archivedDayId: string | null;
  newDayId: string;
};

/**
 * Archives the current active day (if any) and creates a new one in
 * a Firestore transaction. The active-day query happens OUTSIDE the
 * transaction (Firestore can't run collection queries inside), so a
 * race between query and transaction-start is theoretically possible.
 * In a single-family deployment, the worst case is a second concurrent
 * call that briefly leaves two active days; the watcher resolves to
 * whichever wrote last. Acceptable; documented in ARCHITECTURE_V3.md.
 *
 * V3 day write deliberately omits `archivedAt` and `createdAt` (V2
 * carried these; V3 schema does not). Status is the only signal of
 * archive state; `Day.date` carries the date.
 */
export async function startNewDay(
  db: Firestore,
  childId: string,
  input: StartNewDayInput,
): Promise<StartNewDayResult> {
  const activeQuery = query(daysRef(db, childId), where("status", "==", "active"), limit(1));
  const activeSnap = await getDocs(activeQuery);
  const activeDoc = activeSnap.empty ? null : activeSnap.docs[0]!;

  // If the day being archived has a recorded (in-progress) bedtime, trim
  // its endTime to the new day's wakeTime so the overnight sleep block
  // visually meets the wake event instead of overshooting to the
  // placeholder endTime (R7.1 defaults bedtime.endTime to
  // defaultWakeTime + 24h at start; the actual wake is the truth).
  // Already-completed bedtimes (state="completed") have an
  // explicit user-set endTime and are left alone.
  let bedtimeToTrim: { ref: ReturnType<typeof doc>; current: Event } | null = null;
  if (activeDoc) {
    const eventsSnap = await getDocs(
      collection(db, eventsCollectionPath(childId, activeDoc.id)).withConverter(v3EventConverter),
    );
    for (const d of eventsSnap.docs) {
      const e = d.data();
      if (e.type === "bedtime" && e.lifecycle.state === "recorded") {
        bedtimeToTrim = { ref: d.ref, current: e };
        break;
      }
    }
  }

  // Bedtime endTime lives in the OLD day's TimeMin frame (cross-day, ≥1440).
  // newWakeTime is the NEW day's wakeTime in its own frame (e.g. 450 for 7:30a).
  // Shift by 24h so the trim writes a value that's after the bedtime's
  // startTime in the same frame.
  const trimEnd = input.newWakeTime + 24 * 60;

  return runTransaction(db, async (tx) => {
    if (activeDoc) {
      tx.update(activeDoc.ref, { status: "archived" });
    }
    if (bedtimeToTrim) {
      tx.update(bedtimeToTrim.ref, {
        endTime: trimEnd,
        lifecycle: reduceLifecycle(bedtimeToTrim.current.lifecycle, {
          type: "TIME_EDIT",
          at: trimEnd,
        }),
      });
    }
    const newDay: Day = {
      id: input.newDayId,
      childId,
      date: input.newDate,
      status: "active",
      wakeTime: input.newWakeTime,
      suppressedRecurringIds: [],
      suppressedDaycareDay: false,
      ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
    };
    tx.set(dayRef(db, childId, input.newDayId), newDay);
    return {
      archivedDayId: activeDoc?.id ?? null,
      newDayId: input.newDayId,
    };
  });
}
