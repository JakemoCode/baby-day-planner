/*
 * Lazy Firebase client.
 *
 * IMPORTANT: NEXT_PUBLIC_* env vars must be accessed via direct property
 * (`process.env.NEXT_PUBLIC_FIREBASE_API_KEY`), not via dynamic key
 * (`process.env[name]`). The Next.js compiler statically replaces direct
 * accesses at build time with literal values for the client bundle. Dynamic
 * key access ships unchanged and reads as undefined in the browser, where
 * `process.env` is essentially empty. This was the cause of the
 * "Missing Firebase env var" runtime error during local dev.
 *
 * `auth`, `db`, and `firebaseApp` are exposed as Proxies that initialise
 * Firebase on first property access. Server-render can traverse the module
 * graph without throwing; client-side init happens lazily when AuthProvider
 * mounts in the browser.
 */

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

let _app: FirebaseApp | undefined;
let _auth: Auth | undefined;
let _db: Firestore | undefined;
let _authEmulatorConnected = false;
let _dbEmulatorConnected = false;

function shouldUseEmulators(): boolean {
  return process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "1" && typeof window !== "undefined";
}

function getOrInitApp(): FirebaseApp {
  if (_app) return _app;
  const existing = getApps()[0];
  if (existing) {
    _app = existing;
    return _app;
  }

  // Direct property access — required for Next.js compile-time inlining
  // in the client bundle. Do NOT change to process.env[name].
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey) throw new Error("Missing Firebase env var: NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!authDomain) throw new Error("Missing Firebase env var: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!projectId) throw new Error("Missing Firebase env var: NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!appId) throw new Error("Missing Firebase env var: NEXT_PUBLIC_FIREBASE_APP_ID");

  _app = initializeApp({ apiKey, authDomain, projectId, appId });
  return _app;
}

function getAuthInstance(): Auth {
  if (!_auth) {
    _auth = getAuth(getOrInitApp());
    if (shouldUseEmulators() && !_authEmulatorConnected) {
      connectAuthEmulator(_auth, "http://localhost:9099", { disableWarnings: true });
      _authEmulatorConnected = true;
    }
  }
  return _auth;
}

function getDbInstance(): Firestore {
  if (!_db) {
    _db = getFirestore(getOrInitApp());
    if (shouldUseEmulators() && !_dbEmulatorConnected) {
      connectFirestoreEmulator(_db, "localhost", 8080);
      _dbEmulatorConnected = true;
    }
  }
  return _db;
}

export const firebaseApp: FirebaseApp = new Proxy({} as FirebaseApp, {
  get: (_t, prop) => Reflect.get(getOrInitApp(), prop),
});

export const auth: Auth = new Proxy({} as Auth, {
  get: (_t, prop) => Reflect.get(getAuthInstance(), prop),
});

export const db: Firestore = new Proxy({} as Firestore, {
  get: (_t, prop) => Reflect.get(getDbInstance(), prop),
});
