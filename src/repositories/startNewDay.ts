import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  where,
  type Firestore,
} from "firebase/firestore";
import type { Day } from "@/domain";
import { dayConverter } from "@/lib/firestore/converters";
import { dayPath, daysCollectionPath } from "@/lib/firestore/paths";

export type StartNewDayInput = {
  newDayId: string;
  newDate: string;
  newWakeTime: string;
  ownershipTemplateId?: string;
  now: string;
};

export type StartNewDayResult = {
  archivedDayId: string | null;
  newDayId: string;
};

export async function startNewDay(
  db: Firestore,
  childId: string,
  input: StartNewDayInput,
): Promise<StartNewDayResult> {
  const daysRef = collection(db, daysCollectionPath(childId)).withConverter(dayConverter);
  const activeQuery = query(daysRef, where("status", "==", "active"), limit(1));
  const activeSnap = await getDocs(activeQuery);
  const activeDoc = activeSnap.empty ? null : activeSnap.docs[0]!;

  return runTransaction(db, async (tx) => {
    if (activeDoc) {
      tx.update(activeDoc.ref, { status: "archived", archivedAt: input.now });
    }
    const newDay: Day = {
      id: input.newDayId,
      childId,
      date: input.newDate,
      status: "active",
      wakeTime: input.newWakeTime,
      createdAt: input.now,
      ...(input.ownershipTemplateId ? { ownershipTemplateId: input.ownershipTemplateId } : {}),
    };
    tx.set(doc(db, dayPath(childId, input.newDayId)).withConverter(dayConverter), newDay);
    return {
      archivedDayId: activeDoc?.id ?? null,
      newDayId: input.newDayId,
    };
  });
}
