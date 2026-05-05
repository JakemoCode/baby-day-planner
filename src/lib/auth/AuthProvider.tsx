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
import { isAllowlisted } from "./allowlist";

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
      setUser(u);
      if (!u) {
        setStatus("signed_out");
      } else if (isAllowlisted(u.email)) {
        setStatus("authorized");
      } else {
        setStatus("forbidden");
      }
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
