"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { AppShell } from "@/components/shared/AppShell";

const CHILD_NAME = process.env.NEXT_PUBLIC_DEFAULT_CHILD_NAME ?? "Aden";

export default function AuthedLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed_out" || status === "forbidden") {
      router.replace("/sign-in");
    }
  }, [status, router]);

  if (status !== "authorized") {
    return (
      <main style={{ padding: "var(--space-4)" }}>
        <p>Loading…</p>
      </main>
    );
  }

  return <AppShell childName={CHILD_NAME}>{children}</AppShell>;
}
