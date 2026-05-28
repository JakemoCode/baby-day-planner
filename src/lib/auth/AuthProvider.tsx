"use client";

import { createContext, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";

// `"forbidden"` retained for downstream type compatibility; client never sets it today.
// Per-user isolation is enforced by Firestore rules (canAccessChild + createdBy), not an email gate.
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
    // Acknowledge any pending redirect; onAuthStateChanged delivers the user.
    // Failure is non-fatal (not returning from a sign-in redirect).
    getRedirectResult(auth).catch(() => {
      /* non-fatal */
    });

    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setStatus(u ? "authorized" : "signed_out");
    });
  }, []);

  const value: AuthContextValue = {
    user,
    status,
    async signIn() {
      // Redirect flow (not popup): next page load boots with auth fully attached,
      // avoiding COOP issues and the in-session auth/Firestore race.
      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
    },
    async signOut() {
      await fbSignOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
