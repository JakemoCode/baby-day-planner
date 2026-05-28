/*
 * Firebase client (eager init).
 *
 * Two non-obvious constraints:
 * 1. NEXT_PUBLIC_* vars MUST use direct property access — Next.js statically
 *    replaces them at compile time; dynamic key access (`process.env[name]`)
 *    ships as undefined in the browser.
 * 2. Export real Firebase instances, NOT Proxies — the Firestore SDK does
 *    `instanceof` checks internally and rejects Proxy handles.
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

// Connect to local emulators (browser-only; localhost isn't reachable in SSR).
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "1" && typeof window !== "undefined") {
  const w = window as unknown as { __firebaseEmulatorsConnected?: boolean };
  if (!w.__firebaseEmulatorsConnected) {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
    w.__firebaseEmulatorsConnected = true;
  }
}
