"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { watchSettings } from "../repositories/settings";
import type { Settings } from "../schemas";

export type UseV3SettingsResult = {
  settings: Settings | null;
  loading: boolean;
};

/** Subscribes to the V3 settings doc. Converter applies `normalizeSettingsDoc` on read. */
export function useV3Settings(childId: string): UseV3SettingsResult {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Stale-callback guard: prevents in-flight snapshot from prior childId.
    let active = true;
    const unsub = watchSettings(db, childId, (s) => {
      if (!active) return;
      setSettings(s);
      setLoading(false);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [childId]);

  return { settings, loading };
}
