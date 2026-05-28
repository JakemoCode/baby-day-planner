"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { watchChild } from "../repositories/children";
import type { Child } from "../schemas";

export type UseV3ChildResult = {
  child: Child | null;
  loading: boolean;
};

/**
 * Subscribes to the V3 child doc. Empty `childId` is a no-op (loading stays true),
 * so gating layouts can mount before a child is resolved.
 */
export function useV3Child(childId: string): UseV3ChildResult {
  const [child, setChild] = useState<Child | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!childId) return;
    // Stale-callback guard: prevents an in-flight snapshot from a previous childId
    // writing into the new state. Residual flash bounded by Firestore latency.
    let active = true;
    const unsub = watchChild(db, childId, (c) => {
      if (!active) return;
      setChild(c);
      setLoading(false);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [childId]);

  return { child, loading };
}
