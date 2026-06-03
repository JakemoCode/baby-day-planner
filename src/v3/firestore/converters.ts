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
  Invite,
  OwnershipTemplate,
  Settings,
  TomorrowPlan,
  User,
} from "../schemas";
import { withV3DayDefaults } from "./dayDefaults";
import { withV3EventDefaults } from "./eventDefaults";
import { normalizeSettingsDoc } from "./settingsDefaults";
import { isEngineEmittedId } from "../lib/eventConventions";

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

export const v3InviteConverter = passthrough<Invite>();

/**
 * Settings converter applies `normalizeSettingsDoc` on read so partial/legacy
 * docs become engine-safe across every read path, including one-shot
 * `getSettings` callers that bypass `useV3Settings`.
 */
export const v3SettingsConverter: FirestoreDataConverter<Settings> = {
  toFirestore: (data) => data,
  fromFirestore: (snap: QueryDocumentSnapshot, opts?: SnapshotOptions) => {
    // Snapshot data is always present when the converter is invoked;
    // normalizeSettingsDoc handles missing fields and legacy migrations.
    return normalizeSettingsDoc(snap.data(opts));
  },
};

/**
 * Event converter applies `withV3EventDefaults` on read so partial docs
 * become engine-safe across every read path. Without this, docs missing
 * `lifecycle` or `kind` crash the engine/renderer downstream.
 */
export const v3EventConverter: FirestoreDataConverter<Event> = {
  // Write seam guard (§F59 / BOTTLE_SPEC §3.1): projections are ephemeral and must
  // never be persisted with their engine-emitted `proj_` id — that was the
  // zombie/flicker class. A projection must be *realized* (re-keyed via
  // recordedIdForEvent) before it reaches Firestore. Throwing here makes
  // "persisted ⇒ realized" hold by construction, so isEngineEmittedId is
  // ground-truth rather than a heuristic.
  toFirestore: (data) => {
    if (typeof data.id === "string" && isEngineEmittedId(data.id)) {
      throw new Error(
        `Refusing to persist an unrealized projection (${data.id}). Realize via recordedIdForEvent first.`,
      );
    }
    return data;
  },
  fromFirestore: (snap: QueryDocumentSnapshot, opts?: SnapshotOptions) => {
    return withV3EventDefaults(snap.data(opts) as Partial<Event>);
  },
};

/**
 * Day converter applies `withV3DayDefaults` on read across all read paths.
 * Write path is passthrough — V3 callers always supply a fully-shaped Day.
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
