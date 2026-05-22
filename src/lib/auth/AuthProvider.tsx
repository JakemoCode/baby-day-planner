"use client";

import { createContext, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { userPath } from "@/lib/firestore/paths";

// `"forbidden"` retained in the union for downstream type compatibility
// (useSessionResolution / layouts may surface it for future server-side
// gating). The client today never sets it: any signed-in Google user
// becomes `"authorized"`. Per-user data isolation is enforced by
// Firestore rules (canAccessChild + createdBy), not by an email gate.
export type AuthStatus = "loading" | "signed_out" | "authorized" | "forbidden";

export type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUser(null);
        setStatus("signed_out");
        return;
      }
      // Two-stage gate before flipping state to "authorized":
      //   1. getIdToken — forces the Auth SDK to fetch + cache a token
      //   2. getDoc(users/{uid}) — forces the Firestore SDK's internal
      //      auth integration to actually attach that token to a request
      //
      // Why both: the Auth SDK and Firestore SDK each maintain their own
      // listener on auth state changes. getIdToken only proves the Auth
      // SDK is ready; the Firestore SDK's request-time auth pipeline may
      // not have processed the auth change yet. A real Firestore read
      // blocks until that pipeline has the token, eliminating the
      // "Missing or insufficient permissions" cascade on first subscription
      // mount after fresh sign-in.
      //
      // The users/{uid} read is the cheapest possible probe: rule is
      // `request.auth.uid == uid` (no get() lookups), and the doc may or
      // may not exist (newly-signed-in users have no doc yet). We swallow
      // the result — only the side effect of "Firestore SDK now has auth"
      // matters.
      //
      // Cost: ~50–200ms added to sign-in flow. Acceptable for a stable
      // dashboard mount.
      const initialize = async () => {
        try {
          await u.getIdToken();
          await getDoc(doc(db, userPath(u.uid)));
        } catch {
          // Probe failure (network, doc-not-found, etc.) is non-fatal — we
          // still proceed to authorized. If auth itself was broken, the
          // outer onAuthStateChanged would have fired with u=null.
        }
        setUser(u);
        setStatus("authorized");
      };
      void initialize();
    });
  }, []);

  const value: AuthContextValue = {
    user,
    status,
    async signIn() {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    },
    async signOut() {
      await fbSignOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
