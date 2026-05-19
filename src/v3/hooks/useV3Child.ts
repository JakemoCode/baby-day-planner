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
 * Subscribes to the V3 child doc. Mirrors `useV3Settings` shape.
 * Passes empty `childId` is a no-op (loading stays true, child stays null) —
 * lets gating layouts mount the hook before a child is resolved.
 */
export function useV3Child(childId: string): UseV3ChildResult {
  const [child, setChild] = useState<Child | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!childId) return;
    return watchChild(db, childId, (c) => {
      setChild(c);
      setLoading(false);
    });
  }, [childId]);

  return { child, loading };
}
