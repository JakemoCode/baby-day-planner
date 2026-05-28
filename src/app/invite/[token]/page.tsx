"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { db } from "@/lib/firebase/client";
import { consumeInvite } from "@/v3/repositories/invites";
import { SignIn } from "@/lib/auth/SignIn";
import styles from "./page.module.css";

type ClaimState = { status: "idle" } | { status: "error"; message: string };

/**
 * Invite consumption route — top-level (not inside signed-in-with-child) since it grants child access.
 * Signed-out → shows SignIn then claims on auth. Signed-in → claims immediately.
 */
export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const { user, status } = useAuth();
  const router = useRouter();
  const [claim, setClaim] = useState<ClaimState>({ status: "idle" });
  // Guards against React Strict Mode double-fire — second consumeInvite call would throw "already consumed".
  const startedRef = useRef(false);

  useEffect(() => {
    if (status !== "authorized" || !user || !token) return;
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        await consumeInvite(db, token, user.uid);
        router.replace("/");
      } catch (err) {
        setClaim({
          status: "error",
          message: err instanceof Error ? err.message : "Could not claim invite.",
        });
      }
    })();
  }, [status, user, token, router]);

  if (!token) {
    return (
      <main className={styles.page}>
        <p className={styles.error}>Missing invite token.</p>
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main className={styles.page}>
        <p>Loading…</p>
      </main>
    );
  }

  if (status === "signed_out" || status === "forbidden") {
    return (
      <main className={styles.page}>
        <h1 className={styles.heading}>You&apos;ve been invited</h1>
        <p className={styles.lead}>
          Sign in to accept the invite. We&apos;ll link your account after you authenticate.
        </p>
        <SignIn />
      </main>
    );
  }

  if (claim.status === "error") {
    return (
      <main className={styles.page}>
        <h1 className={styles.heading}>Couldn&apos;t accept the invite</h1>
        <p role="alert" className={styles.error}>
          {claim.message}
        </p>
        <p className={styles.lead}>Ask the person who invited you for a fresh link.</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <p>Accepting invite…</p>
    </main>
  );
}
