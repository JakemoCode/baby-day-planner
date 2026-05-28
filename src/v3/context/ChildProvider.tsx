"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { useV3User } from "@/v3/hooks/useV3User";
import { useV3Child } from "@/v3/hooks/useV3Child";
import type { Child } from "@/v3/schemas";

type ChildContextValue = { child: Child };

const ChildContext = createContext<ChildContextValue | null>(null);

export type ChildProviderResolution =
  | { status: "loading" }
  | { status: "no-user-doc" }
  | { status: "no-child" }
  | { status: "ready"; child: Child };

/** Resolves uid → user doc → first childId → Child; returns a discriminated union for loading/gate rendering. */
export function useChildResolution(): ChildProviderResolution {
  const auth = useAuth();
  const uid = auth.user?.uid ?? "";
  const { user: userDoc, loading: userLoading } = useV3User(uid);
  const firstChildId = userDoc?.childIds[0] ?? "";
  const { child, loading: childLoading } = useV3Child(firstChildId);

  if (auth.status !== "authorized") return { status: "loading" };
  if (userLoading) return { status: "loading" };
  if (!userDoc) return { status: "no-user-doc" };
  if (userDoc.childIds.length === 0) return { status: "no-child" };
  if (childLoading || !child) return { status: "loading" };
  return { status: "ready", child };
}

export function ChildProvider({ child, children }: { child: Child; children: ReactNode }) {
  return <ChildContext.Provider value={{ child }}>{children}</ChildContext.Provider>;
}

export function useCurrentChild(): Child {
  const ctx = useContext(ChildContext);
  if (!ctx) throw new Error("useCurrentChild must be used within ChildProvider");
  return ctx.child;
}
