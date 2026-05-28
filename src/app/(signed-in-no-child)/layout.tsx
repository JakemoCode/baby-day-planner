"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { useChildResolution } from "@/v3/context/ChildProvider";

/**
 * Guards the no-child route group: unauthenticated → /sign-in, already has child → /.
 * Inverse of (signed-in-with-child)/layout.tsx.
 */
export default function SignedInNoChildLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const resolution = useChildResolution();

  useEffect(() => {
    if (status === "signed_out" || status === "forbidden") {
      router.replace("/sign-in");
    }
  }, [status, router]);

  useEffect(() => {
    if (resolution.status === "ready") {
      router.replace("/");
    }
  }, [resolution.status, router]);

  if (status !== "authorized") {
    return (
      <main style={{ padding: "var(--space-4)" }}>
        <p>Loading…</p>
      </main>
    );
  }

  return <main style={{ minHeight: "100vh" }}>{children}</main>;
}
