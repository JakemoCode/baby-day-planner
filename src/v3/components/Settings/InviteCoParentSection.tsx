"use client";

import { useState } from "react";
import { collection, doc } from "firebase/firestore";
import { useAuth } from "@/lib/auth/useAuth";
import { db } from "@/lib/firebase/client";
import { INVITES } from "@/lib/firestore/paths";
import { useCurrentChild } from "@/v3/context/ChildProvider";
import { createInvite } from "@/v3/repositories/invites";
import { sendInviteEmail } from "@/lib/invites/sendInviteEmail";
import styles from "./InviteCoParentSection.module.css";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function buildInviteUrl(token: string): string {
  if (typeof window === "undefined") return `/invite/${token}`;
  return `${window.location.origin}/invite/${token}`;
}

/** §F3: mints a 7-day co-parent invite token, surfaces the shareable link, and copies to clipboard. */
export function InviteCoParentSection() {
  const { user } = useAuth();
  const child = useCurrentChild();
  const [token, setToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!user) return;
    setGenerating(true);
    setError(null);
    try {
      const newToken = doc(collection(db, INVITES)).id;
      const now = Date.now();
      await createInvite(db, {
        token: newToken,
        childId: child.id,
        createdBy: user.uid,
        createdAt: now,
        expiresAt: now + INVITE_TTL_MS,
      });
      setToken(newToken);
      // Fire-and-forget email stub; no-op until NEXT_PUBLIC_EMAIL_INVITES is enabled.
      void sendInviteEmail({
        token: newToken,
        to: "",
        fromDisplayName: user.displayName ?? user.email ?? "A co-parent",
        childDisplayName: child.displayName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate link.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(buildInviteUrl(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard — select and copy manually.");
    }
  }

  if (!token) {
    return (
      <div className={styles.section}>
        <p className={styles.lead}>
          {`Share access to ${child.displayName} with another caregiver. They'll see (and can record) all of today's events.`}
        </p>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => void handleGenerate()}
          disabled={generating}
        >
          {generating ? "Generating…" : "Generate invite link"}
        </button>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
    );
  }

  const url = buildInviteUrl(token);
  return (
    <div className={styles.section}>
      <p className={styles.lead}>
        Send this link to the co-parent. It expires in 7 days and can be used once.
      </p>
      <div className={styles.linkRow}>
        <input
          type="text"
          value={url}
          readOnly
          className={styles.linkInput}
          aria-label="Invite link"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className={styles.copyBtn} onClick={() => void handleCopy()}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <button
        type="button"
        className={styles.secondaryBtn}
        onClick={() => {
          setToken(null);
          setCopied(false);
          setError(null);
        }}
      >
        Generate a different link
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
