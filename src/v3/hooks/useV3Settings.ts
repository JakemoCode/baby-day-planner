"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { withV3SettingsDefaults } from "../firestore/settingsDefaults";
import { watchSettings } from "../repositories/settings";
import type { Settings } from "../schemas";

export type UseV3SettingsResult = {
  settings: Settings | null;
  loading: boolean;
};

/**
 * Subscribes to the V3 settings doc. Partial / V2-leftover docs flow
 * through `withV3SettingsDefaults` so the engine never sees an
 * undefined `bottleChain` / `daycare.weekdays` / etc. Removed once the
 * Settings page cutover guarantees complete writes.
 */
export function useV3Settings(childId: string): UseV3SettingsResult {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return watchSettings(db, childId, (s) => {
      setSettings(withV3SettingsDefaults(s));
      setLoading(false);
    });
  }, [childId]);

  return { settings, loading };
}
