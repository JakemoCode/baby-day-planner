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

// `"forbidden"` retained in the union for downstream type compatibility
// (useSessionResolution / layouts may surface it for future server-side
// gating). The client today never sets it: any signed-in user becomes
// `"authorized"`. Per-user data isolation is enforced by Firestore rules
// (canAccessChild + createdBy), not by an email gate.
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
    // Resolve any pending redirect result. We don't use its return value —
    // onAuthStateChanged below fires with the signed-in user on the same
    // boot. Calling getRedirectResult signals to the Auth SDK that we've
    // acknowledged the redirect; failure is non-fatal (typically means we
    // weren't actually returning from a sign-in redirect).
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
      // signInWithRedirect navigates the browser to Google's OAuth flow,
      // which redirects back to our app on completion. The next page load
      // boots with auth fully attached — both the Auth SDK and the
      // Firestore SDK initialize together against the established session.
      // No popup, no COOP issues, no in-session race between auth state
      // populating and Firestore's internal auth pipeline catching up.
      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
    },
    async signOut() {
      await fbSignOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
