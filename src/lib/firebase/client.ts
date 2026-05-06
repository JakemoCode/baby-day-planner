/*
 * Lazy Firebase client.
 *
 * The previous version constructed the FirebaseApp at module-load time, which
 * meant any module in the import graph (e.g. AuthProvider) caused requireEnv()
 * to fire during SSR — before NEXT_PUBLIC_* values were always available. This
 * threw a hard "Missing Firebase env var" runtime error on the very first
 * request.
 *
 * This version exposes `auth` and `db` as Proxies that initialise the
 * Firebase app on first property access. Server-rendered code can evaluate
 * the module without touching env vars; the client (where NEXT_PUBLIC_* is
 * inlined at build/dev compile time) initialises lazily on first use.
 */

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing Firebase env var: ${name}`);
  }
  return value;
}

let _app: FirebaseApp | undefined;
let _auth: Auth | undefined;
let _db: Firestore | undefined;
let _emulatorsConnected = false;

function getOrInitApp(): FirebaseApp {
  if (_app) return _app;
  const existing = getApps()[0];
  if (existing) {
    _app = existing;
    return _app;
  }
  _app = initializeApp({
    apiKey: requireEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requireEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: requireEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    appId: requireEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
  });
  return _app;
}

function maybeConnectEmulators(): void {
  if (_emulatorsConnected) return;
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "1") return;
  if (typeof window === "undefined") return;
  if (!_auth || !_db) return;
  connectAuthEmulator(_auth, "http://localhost:9099", { disableWarnings: true });
  connectFirestoreEmulator(_db, "localhost", 8080);
  _emulatorsConnected = true;
}

function getAuthInstance(): Auth {
  if (!_auth) {
    _auth = getAuth(getOrInitApp());
    maybeConnectEmulators();
  }
  return _auth;
}

function getDbInstance(): Firestore {
  if (!_db) {
    _db = getFirestore(getOrInitApp());
    maybeConnectEmulators();
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
