"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { AppShell } from "@/components/shared/AppShell";
import { ChildProvider, useChildResolution } from "@/v3/context/ChildProvider";

/**
 * Guards this route group: unauthenticated → /sign-in, no child → /welcome.
 * Resolves the first child and renders AppShell in ChildProvider when ready.
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

  // Latches true once "ready" — prevents /welcome redirect during the post-onboarding Firestore race
  // where the cached pre-write snapshot (user=null) arrives before the server snapshot.
  const everReadyRef = useRef(false);

  useEffect(() => {
    if (resolution.status === "ready") {
      everReadyRef.current = true;
    }
  }, [resolution.status]);

  useEffect(() => {
    if (resolution.status !== "no-user-doc" && resolution.status !== "no-child") return;
    if (everReadyRef.current) return;
    router.replace("/welcome");
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
