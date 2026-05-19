/**
 * V3 Firestore data converters.
 *
 * Every typed converter applies its defaulter on read so partial /
 * hand-edited docs become engine-safe across every read path, including
 * consumers that bypass the hook layer (e.g. one-shot `getSettings` calls).
 * Template converter is a passthrough — V3 always writes those fully-shaped.
 */

import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
} from "firebase/firestore";
import type {
  Child,
  Day,
  Event,
  OwnershipTemplate,
  Settings,
  TomorrowPlan,
  User,
} from "../schemas";
import { withV3DayDefaults } from "./dayDefaults";
import { withV3EventDefaults } from "./eventDefaults";
import { withV3SettingsDefaults } from "./settingsDefaults";

function passthrough<T extends object>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (data) => data,
    fromFirestore: (snap: QueryDocumentSnapshot, opts?: SnapshotOptions) => snap.data(opts) as T,
  };
}

export const v3TemplateConverter = passthrough<OwnershipTemplate>();

export const v3TomorrowPlanConverter = passthrough<TomorrowPlan>();

export const v3ChildConverter = passthrough<Child>();

export const v3UserConverter = passthrough<User>();

/**
 * Settings converter applies `withV3SettingsDefaults` on read so partial
 * docs become engine-safe Settings across every read path, including
 * consumers that bypass `useV3Settings` (e.g. one-shot `getSettings` calls).
 * Mirrors the pattern established by `v3EventConverter`.
 */
export const v3SettingsConverter: FirestoreDataConverter<Settings> = {
  toFirestore: (data) => data,
  fromFirestore: (snap: QueryDocumentSnapshot, opts?: SnapshotOptions) => {
    // Snapshot data is always present when the converter is invoked;
    // the non-null assertion is safe here (same pattern as v3DayConverter).
    return withV3SettingsDefaults(snap.data(opts) as Partial<Settings>)!;
  },
};

/**
 * Event converter applies `withV3EventDefaults` on read so partial docs
 * become engine-safe Events across every read path, including consumers
 * that bypass `useV3Events` (e.g. the one-shot `listEvents` call in the
 * history detail page). Without this, a partial doc missing `lifecycle`
 * or `kind` would crash the engine / renderer downstream.
 */
export const v3EventConverter: FirestoreDataConverter<Event> = {
  toFirestore: (data) => data,
  fromFirestore: (snap: QueryDocumentSnapshot, opts?: SnapshotOptions) => {
    return withV3EventDefaults(snap.data(opts) as Partial<Event>);
  },
};

/**
 * Day converter applies `withV3DayDefaults` on read so partial day docs
 * become engine-safe Day objects across every read path: `getDay`,
 * `getDayByDate`, `listArchivedDays`, `watchActiveDay`. Write path stays
 * passthrough — V3 callers always supply a fully-shaped Day.
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
