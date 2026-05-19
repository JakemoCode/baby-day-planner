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
    return watchUser(db, uid, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, [uid]);

  return { user, loading };
}
