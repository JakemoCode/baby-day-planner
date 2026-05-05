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
import type { Event } from "@/domain";
import { eventConverter } from "@/lib/firestore/converters";
import { eventPath, eventsCollectionPath } from "@/lib/firestore/paths";

function eventRef(db: Firestore, childId: string, dayId: string, eventId: string) {
  return doc(db, eventPath(childId, dayId, eventId)).withConverter(eventConverter);
}

function eventsRef(db: Firestore, childId: string, dayId: string) {
  return collection(db, eventsCollectionPath(childId, dayId)).withConverter(eventConverter);
}

export async function createEvent(
  db: Firestore,
  childId: string,
  event: Event,
): Promise<void> {
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

export async function listEvents(
  db: Firestore,
  childId: string,
  dayId: string,
): Promise<Event[]> {
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
