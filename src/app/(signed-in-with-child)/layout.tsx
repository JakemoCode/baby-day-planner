"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { AppShell } from "@/components/shared/AppShell";
import { ChildProvider, useChildResolution } from "@/v3/context/ChildProvider";

/**
 * Gates the (signed-in-with-child) route group on three conditions:
 *   1. Auth resolved + allowlisted    → otherwise → /sign-in
 *   2. /users/{uid} doc exists        → otherwise → /welcome (first sign-in)
 *   3. user.childIds non-empty        → otherwise → /welcome (signed-in, not yet onboarded)
 *
 * If all three pass, resolves /children/{firstChildId} and renders AppShell
 * wrapped in ChildProvider. Loading state shows during any of the chained
 * Firestore reads.
 */
export default function SignedInWithChildLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const resolution = useChildResolution();

  useEffect(() => {
    if (status === "signed_out" || status === "forbidden") {
      router.replace("/sign-in");
    }
  }, [status, router]);

  useEffect(() => {
    if (resolution.status === "no-user-doc" || resolution.status === "no-child") {
      router.replace("/welcome");
    }
  }, [resolution.status, router]);

  if (resolution.status !== "ready") {
    return (
      <main style={{ padding: "var(--space-4)" }}>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <ChildProvider child={resolution.child}>
      <AppShell
        childId={resolution.child.id}
        childName={resolution.child.displayName}
        dateOfBirth={resolution.child.dateOfBirth}
      >
        {children}
      </AppShell>
    </ChildProvider>
  );
}
