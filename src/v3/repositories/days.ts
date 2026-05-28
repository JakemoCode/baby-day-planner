/**
 * V3 days repository. Path-compatible with V2 (`children/{childId}/days/{dayId}`).
 * Note: `archiveDay` omits `archivedAt` (V2 carried it); V3 uses `Day.date` for sorting.
 */

import {
  arrayUnion,
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
import type { Day, Event, OwnerRef, TimeMin, TomorrowPlan } from "../schemas";

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
 * Get the day doc for a calendar date, lazy-creating a `planned` doc if absent.
 * Uses `planned` (not `active`) so existing active-day subscriptions are unaffected.
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
    id: deterministicDayId(childId, date),
    childId,
    date,
    status: "planned",
    wakeTime: defaultWakeTime,
    suppressedRecurringIds: [],
    suppressedDaycareDay: false,
    suppressedDreamFeed: false,
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

/**
 * Write a single owner override to `Day.ownerOverrides[eventKey]` without anchoring the event's time.
 * Owner-only edits on projected events must route here — writing a recorded doc would prevent cascade re-projection.
 * Uses Firestore dot-notation to merge into the existing map.
 */
export async function updateDayOwnerOverride(
  db: Firestore,
  childId: string,
  dayId: string,
  eventKey: string,
  owner: OwnerRef,
): Promise<void> {
  await updateDoc(dayRef(db, childId, dayId), {
    [`ownerOverrides.${eventKey}`]: owner,
  });
}

/**
 * Suppress a daily-recurring event for today only (R11.6). Uses arrayUnion so
 * duplicate calls are safe. Resets automatically on the next day's fresh Doc.
 */
export async function suppressRecurringForDay(
  db: Firestore,
  childId: string,
  dayId: string,
  recurringId: string,
): Promise<void> {
  await updateDoc(dayRef(db, childId, dayId), {
    suppressedRecurringIds: arrayUnion(recurringId),
  });
}

/** Set a singleton boolean suppression flag for today. Resets on the next day's fresh doc. */
function setDayBooleanFlag(
  db: Firestore,
  childId: string,
  dayId: string,
  field: "suppressedDaycareDay" | "suppressedDreamFeed",
): Promise<void> {
  return updateDoc(dayRef(db, childId, dayId), { [field]: true });
}

/** Per-day daycare opt-out (R21.5). */
export function suppressDaycareForDay(
  db: Firestore,
  childId: string,
  dayId: string,
): Promise<void> {
  return setDayBooleanFlag(db, childId, dayId, "suppressedDaycareDay");
}

/** Per-day dream-feed opt-out (R5.5). */
export function suppressDreamFeedForDay(
  db: Firestore,
  childId: string,
  dayId: string,
): Promise<void> {
  return setDayBooleanFlag(db, childId, dayId, "suppressedDreamFeed");
}

/**
 * Update wakeTime AND close any in-progress overnight bedtime in a single transaction.
 * Without the bedtime trim the dashboard treats yesterday's open bedtime as still in-progress.
 * Idempotent: if no in-progress bedtime exists, only the Day write runs.
 */
export async function editWakeTime(
  db: Firestore,
  childId: string,
  dayId: string,
  newWakeTime: TimeMin,
): Promise<void> {
  // runTransaction doesn't support collection queries; read events outside the transaction.
  const eventsSnap = await getDocs(
    collection(db, eventsCollectionPath(childId, dayId)).withConverter(v3EventConverter),
  );
  let bedtimeToTrim: { ref: ReturnType<typeof doc>; current: Event } | null = null;
  for (const d of eventsSnap.docs) {
    const e = d.data();
    if (e.type === "bedtime" && e.lifecycle.state === "recorded") {
      bedtimeToTrim = { ref: d.ref, current: e };
      break;
    }
  }

  const trimEnd: TimeMin = newWakeTime + 24 * 60;

  await runTransaction(db, async (tx) => {
    tx.update(dayRef(db, childId, dayId), { wakeTime: newWakeTime });
    if (bedtimeToTrim) {
      tx.update(bedtimeToTrim.ref, {
        endTime: trimEnd,
        lifecycle: reduceLifecycle(bedtimeToTrim.current.lifecycle, {
          type: "TIME_EDIT",
          at: trimEnd,
        }),
      });
    }
  });
}

export async function listArchivedDays(db: Firestore, childId: string, max = 7): Promise<Day[]> {
  // Fetch 3× max to have headroom for same-date dedup. Legacy docs (pre-deterministic-id)
  // carry Date.now()-suffixed ids and won't collapse at the Firestore layer.
  const q = query(
    daysRef(db, childId),
    where("status", "==", "archived"),
    orderBy("date", "desc"),
    limit(max * 3),
  );
  const snap = await getDocs(q);
  const byDate = new Map<string, Day>();
  for (const d of snap.docs) {
    const day = d.data();
    const existing = byDate.get(day.date);
    // Keep the lexicographically-greatest id: legacy Date.now()-suffixed ids sort newest-last.
    if (!existing || day.id > existing.id) {
      byDate.set(day.date, day);
    }
  }
  return Array.from(byDate.values()).slice(0, max);
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
  /** When omitted, `startNewDay` uses a deterministic id so concurrent rollover calls are idempotent. */
  newDayId?: string;
  newDate: string;
  newWakeTime: TimeMin;
  templateId?: string;
  /** Per-event owner overrides from a promoted TomorrowPlan; engine applies at projection time. */
  ownerOverrides?: Record<string, OwnerRef | null>;
};

/** Deterministic day id — prevents concurrent rollover calls from creating duplicate docs. */
export function deterministicDayId(childId: string, date: string): string {
  return `day-${childId}-${date}`;
}

export type StartNewDayResult = {
  archivedDayId: string | null;
  newDayId: string;
};

/**
 * Archive the current active day and create a new one in a Firestore transaction.
 * Active-day query runs outside the transaction (Firestore doesn't support collection
 * queries inside); a concurrent call briefly yields two active days — acceptable in
 * a single-family deployment.
 */
export async function startNewDay(
  db: Firestore,
  childId: string,
  input: StartNewDayInput,
): Promise<StartNewDayResult> {
  const activeQuery = query(daysRef(db, childId), where("status", "==", "active"), limit(1));
  const activeSnap = await getDocs(activeQuery);
  const activeDoc = activeSnap.empty ? null : activeSnap.docs[0]!;

  // Trim any in-progress bedtime's endTime to the new wake so the overnight block
  // doesn't overshoot. Already-completed bedtimes (user-set endTime) are left alone.
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

  // Bedtime endTime is in the old day's cross-day frame (≥1440); shift +24h so the
  // trim lands after the bedtime's startTime in the same frame.
  const trimEnd = input.newWakeTime + 24 * 60;

  const newDayId = input.newDayId ?? deterministicDayId(childId, input.newDate);

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
      id: newDayId,
      childId,
      date: input.newDate,
      status: "active",
      wakeTime: input.newWakeTime,
      suppressedRecurringIds: [],
      suppressedDaycareDay: false,
      suppressedDreamFeed: false,
      ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
      ...(input.ownerOverrides !== undefined ? { ownerOverrides: input.ownerOverrides } : {}),
    };
    tx.set(dayRef(db, childId, newDayId), newDay);
    return {
      archivedDayId: activeDoc?.id ?? null,
      newDayId,
    };
  });
}

// ---------------------------------------------------------------------------
// promoteFromPlan (§F12 + §F17)
// ---------------------------------------------------------------------------

/**
 * Promote a TomorrowPlan into an active Day for `plan.date`. Facade over `startNewDay`.
 * Extras are written after the Day transaction (non-atomic — Firestore can't span
 * Day + N event writes); failures are logged and the Day still exists.
 */
export async function promoteFromPlan(
  db: Firestore,
  childId: string,
  plan: TomorrowPlan,
  defaultWakeTime?: TimeMin,
): Promise<StartNewDayResult> {
  const wakeTime = plan.wakeTime ?? defaultWakeTime;
  if (wakeTime === undefined) {
    throw new Error(
      "promoteFromPlan: plan has no wakeTime and no defaultWakeTime fallback supplied",
    );
  }
  const result = await startNewDay(db, childId, {
    newDate: plan.date,
    newWakeTime: wakeTime,
    ...(plan.startTemplateId !== undefined ? { templateId: plan.startTemplateId } : {}),
    ownerOverrides: plan.ownerOverrides,
  });

  for (const extra of plan.extras) {
    const eventForDay: Event = { ...extra, dayId: result.newDayId };
    try {
      await setDoc(
        doc(db, eventsCollectionPath(childId, result.newDayId), extra.id).withConverter(
          v3EventConverter,
        ),
        eventForDay,
      );
    } catch (err) {
      console.error("[promoteFromPlan] failed to persist extra event", {
        eventId: extra.id,
        dayId: result.newDayId,
        err,
      });
    }
  }

  return result;
}
