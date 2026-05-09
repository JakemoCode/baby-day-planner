/**
 * V3 Firestore data converters.
 *
 * The V3 Event type is structurally what the engine emits and what we
 * persist — no normalization needed. These are typed passthroughs that
 * give us a clean type-tag for Firestore queries built with
 * `withConverter(...)`.
 *
 * The V2 event converter coerces legacy `kind`/`recorded` fields; V3
 * starts with a clean emulator (per the cutover plan) so we don't carry
 * that scaffolding forward.
 */

import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
} from "firebase/firestore";
import type { Day, Event, OwnershipTemplate, Settings } from "../schemas";

function passthrough<T extends object>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (data) => data,
    fromFirestore: (snap: QueryDocumentSnapshot, opts?: SnapshotOptions) => snap.data(opts) as T,
  };
}

export const v3EventConverter = passthrough<Event>();
export const v3DayConverter = passthrough<Day>();
export const v3SettingsConverter = passthrough<Settings>();
export const v3TemplateConverter = passthrough<OwnershipTemplate>();
