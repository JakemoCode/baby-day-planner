import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
} from "firebase/firestore";
import type { Day, Event, OwnershipTemplate, Settings } from "@/domain";

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
export const eventConverter = passthrough<Event>();
export const templateConverter = passthrough<OwnershipTemplate>();
