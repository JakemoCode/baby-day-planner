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
import { withV3DayDefaults } from "./dayDefaults";

function passthrough<T extends object>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (data) => data,
    fromFirestore: (snap: QueryDocumentSnapshot, opts?: SnapshotOptions) => snap.data(opts) as T,
  };
}

export const v3EventConverter = passthrough<Event>();
export const v3SettingsConverter = passthrough<Settings>();
export const v3TemplateConverter = passthrough<OwnershipTemplate>();

/**
 * Day converter applies `withV3DayDefaults` on read so V2-shape day
 * docs (and partial V3 docs) become engine-safe Day objects across
 * every read path: `getDay`, `getDayByDate`, `listArchivedDays`,
 * `watchActiveDay`. Write path stays passthrough — V3 callers always
 * supply a fully-shaped Day.
 *
 * The defaulter remains in `useV3Day` as defense in depth; both
 * applications are idempotent.
 */
export const v3DayConverter: FirestoreDataConverter<Day> = {
  toFirestore: (data) => data,
  fromFirestore: (snap: QueryDocumentSnapshot, opts?: SnapshotOptions) => {
    const raw = snap.data(opts) as Partial<Day>;
    // Defaulter never returns null for a non-null input, so the
    // non-null assertion is safe here. Snapshot data is always present.
    return withV3DayDefaults(raw)!;
  },
};
