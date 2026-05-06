/*
 * Firebase client (eager init, direct env access).
 *
 * Two non-obvious rules baked in:
 *
 * 1. NEXT_PUBLIC_* env vars MUST be accessed via direct property
 *    (`process.env.NEXT_PUBLIC_FIREBASE_API_KEY`), never via dynamic key
 *    (`process.env[name]`). Next.js's compiler statically replaces direct
 *    accesses with literal values at build/dev compile time for both server
 *    and client bundles. Dynamic key access ships unchanged and reads as
 *    undefined in the browser.
 *
 * 2. We expose `auth` and `db` as real Firebase instances, NOT Proxies.
 *    The Firestore SDK does `instanceof` checks on these handles internally
 *    ("Type does not match the expected instance. Did you pass a reference
 *    from a different Firestore SDK?"); a Proxy fails those checks.
 */

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

if (!apiKey) throw new Error("Missing Firebase env var: NEXT_PUBLIC_FIREBASE_API_KEY");
if (!authDomain) throw new Error("Missing Firebase env var: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
if (!projectId) throw new Error("Missing Firebase env var: NEXT_PUBLIC_FIREBASE_PROJECT_ID");
if (!appId) throw new Error("Missing Firebase env var: NEXT_PUBLIC_FIREBASE_APP_ID");

export const firebaseApp: FirebaseApp =
  getApps()[0] ?? initializeApp({ apiKey, authDomain, projectId, appId });
export const auth: Auth = getAuth(firebaseApp);
export const db: Firestore = getFirestore(firebaseApp);

// Connect to local emulators when the env flag is set.
// Browser-only — emulator suite runs on localhost which isn't reachable in SSR.
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "1" && typeof window !== "undefined") {
  const w = window as unknown as { __firebaseEmulatorsConnected?: boolean };
  if (!w.__firebaseEmulatorsConnected) {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
    w.__firebaseEmulatorsConnected = true;
  }
}
