import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
} from "firebase/firestore";
import type { Day, Event, OwnershipTemplate, Settings } from "@/domain";
import { deriveKind } from "@/domain";

function passthrough<T extends object>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (data) => data,
    fromFirestore: (snap: QueryDocumentSnapshot, opts?: SnapshotOptions) => {
      return snap.data(opts) as T;
    },
  };
}

export const settingsConverter = passthrough<Settings>();
export const dayConverter = passthrough<Day>();
export const templateConverter = passthrough<OwnershipTemplate>();

/**
 * Event converter coerces legacy docs that predate the `kind` field by
 * deriving kind from (type, endTime) on read. New writes always carry `kind`
 * because the engine emits it; the toFirestore branch backstops any caller
 * that constructed an Event by hand without it.
 *
 * TODO (cleanup): once Firestore confirms zero docs without `kind`, remove
 * the deriveKind fallback in both directions and revert to a passthrough.
 * Tracked in TIMELINE_V2_PLAN.md §4.
 */
export const eventConverter: FirestoreDataConverter<Event> = {
  toFirestore: (data) => {
    const next = data as Event;
    if (next.kind) return next;
    return { ...next, kind: deriveKind(next.type, next.endTime) };
  },
  fromFirestore: (snap: QueryDocumentSnapshot, opts?: SnapshotOptions) => {
    const data = snap.data(opts) as Event;
    if (data.kind) return data;
    return { ...data, kind: deriveKind(data.type, data.endTime) };
  },
};
