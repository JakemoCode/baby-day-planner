"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { watchUser } from "../repositories/users";
import type { User } from "../schemas";

export type UseV3UserResult = {
  user: User | null;
  loading: boolean;
};

/**
 * Subscribes to the V3 user doc. Empty `uid` is a no-op.
 * `user === null` after loading means "no doc yet" and gates the welcome flow.
 */
export function useV3User(uid: string): UseV3UserResult {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    // Stale-callback guard: `active` flag blocks the previous uid's in-flight snapshot.
    // State shows the prior user until the new snapshot arrives (~100ms Firestore latency).
    let active = true;
    const unsub = watchUser(db, uid, (u) => {
      if (!active) return;
      setUser(u);
      setLoading(false);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [uid]);

  return { user, loading };
}
