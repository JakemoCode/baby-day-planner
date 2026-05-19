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
    // Grace period before redirecting to /welcome: after the welcome submit's
    // writeBatch, this layout mounts and its fresh useV3User subscription
    // can briefly fire with the pre-write cached snapshot (user=null) before
    // the server snapshot arrives. Without this delay, the brief "no-user-doc"
    // bounces back to /welcome and remounts WelcomePage at step 1 (bug Jake
    // hit on 2026-05-19). 200ms is longer than the snapshot lag but short
    // enough to feel instant for the genuine "you haven't onboarded yet" case.
    if (resolution.status !== "no-user-doc" && resolution.status !== "no-child") return;
    const timer = setTimeout(() => router.replace("/welcome"), 200);
    return () => clearTimeout(timer);
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
