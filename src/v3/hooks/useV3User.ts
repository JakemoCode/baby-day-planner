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
 * Subscribes to the V3 user doc for the given auth uid. Mirrors
 * `useV3Settings` shape. Empty `uid` is a no-op (loading stays true) —
 * lets the layout mount the hook before auth resolves.
 *
 * `user === null` after loading completes means "auth user has no doc
 * yet" and gates the welcome flow.
 */
export function useV3User(uid: string): UseV3UserResult {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    // Stale-callback guard: when uid changes, the previous subscription's
    // last in-flight snapshot must NOT write the previous user's doc into
    // the new uid's state. The `active` flag does what we'd otherwise do
    // with `setUser(null)` in the effect body — except React 19's
    // `react-hooks/set-state-in-effect` rule forbids that path. Residual
    // caveat: state still shows the PREVIOUS user/loading=false until the
    // new snapshot arrives. Bounded by Firestore latency (~100ms).
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
