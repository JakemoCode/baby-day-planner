"use client";

import { createContext, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";

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
      // Defer BOTH setUser and setStatus until getIdToken resolves. Why
      // both: downstream hooks (useV3User, useV3Child via useChildResolution)
      // key their subscription effects off `auth.user?.uid`, not `status`.
      // If we set user before the token fetch completes, those subscriptions
      // fire in the race window between auth.user populating and the
      // Firestore SDK's internal auth integration receiving the token —
      // → "Missing or insufficient permissions" denies that don't auto-retry.
      //
      // For a cached token (returning user) getIdToken resolves in <1ms.
      // For a fresh popup sign-in it does a network call (~100–300ms) —
      // that's the actual race window this gate closes.
      u.getIdToken()
        .then(() => {
          setUser(u);
          setStatus("authorized");
        })
        .catch(() => {
          setUser(null);
          setStatus("signed_out");
        });
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
