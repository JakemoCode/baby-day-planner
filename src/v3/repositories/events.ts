/**
 * V3 events repository.
 *
 * CRUD against Firestore for V3-shape events. Path-compatible with V2
 * (`children/{childId}/days/{dayId}/events/{eventId}`) so cutover is a
 * straight import swap; the wire shape changes (TimeMin numbers,
 * lifecycle discriminated union, slot-based owners).
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { eventPath, eventsCollectionPath } from "@/lib/firestore/paths";
import { v3EventConverter } from "../firestore/converters";
import { annotationTime } from "../lib/annotationTime";
import type { Event } from "../schemas";

function eventRef(db: Firestore, childId: string, dayId: string, eventId: string) {
  return doc(db, eventPath(childId, dayId, eventId)).withConverter(v3EventConverter);
}

function eventsRef(db: Firestore, childId: string, dayId: string) {
  return collection(db, eventsCollectionPath(childId, dayId)).withConverter(v3EventConverter);
}

export async function createEvent(db: Firestore, childId: string, event: Event): Promise<void> {
  await setDoc(eventRef(db, childId, event.dayId, event.id), event);
}

export async function updateEvent(
  db: Firestore,
  childId: string,
  dayId: string,
  eventId: string,
  patch: Partial<Event>,
): Promise<void> {
  await updateDoc(eventRef(db, childId, dayId, eventId), patch);
}

export async function deleteEvent(
  db: Firestore,
  childId: string,
  dayId: string,
  eventId: string,
): Promise<void> {
  await deleteDoc(eventRef(db, childId, dayId, eventId));
}

export async function listEvents(db: Firestore, childId: string, dayId: string): Promise<Event[]> {
  const q = query(eventsRef(db, childId, dayId), orderBy("startTime"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export function watchEvents(
  db: Firestore,
  childId: string,
  dayId: string,
  cb: (events: Event[]) => void,
): () => void {
  const q = query(eventsRef(db, childId, dayId), orderBy("startTime"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => d.data()));
  });
}

/**
 * §F59 orphan cleanup: detect docs that share `(type, eventKey)` —
 * orphans from the pre-§F59 era when NapActionButton wrote bare-eventKey
 * ids and useDrawer wrote `recorded_${eventKey}` ids for the same slot.
 *
 * For each duplicate group, keep the most-recently-annotated event and
 * delete the rest. Mirrors the policy in `renderProjection.ts`'s Pass 0
 * dedup so visual and persisted state agree.
 *
 * Idempotent: a second invocation finds no duplicates and is a no-op.
 * Safe to call on every dashboard mount.
 *
 * Returns the list of deleted doc ids for telemetry / testing.
 */
export async function reconcileDuplicateEventDocs(
  db: Firestore,
  childId: string,
  dayId: string,
): Promise<{ deleted: string[] }> {
  const events = await listEvents(db, childId, dayId);
  const groups = new Map<string, Event[]>();
  for (const e of events) {
    if (!e.eventKey) continue;
    const key = `${e.type}:${e.eventKey}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }
  const deleted: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      const aT = annotationTime(a);
      const bT = annotationTime(b);
      if (aT !== bT) return bT - aT; // descending — winner first
      return a.id < b.id ? -1 : 1; // stable tie-break
    });
    const losers = sorted.slice(1);
    await Promise.all(losers.map((l) => deleteEvent(db, childId, dayId, l.id)));
    for (const loser of losers) deleted.push(loser.id);
  }
  return { deleted };
}
