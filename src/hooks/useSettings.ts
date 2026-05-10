"use client";

import { useEffect, useState } from "react";
import type { Settings } from "@/domain";
import { db } from "@/lib/firebase/client";
import { watchSettings } from "@/repositories/settings";
import { withV2SettingsBackcompat } from "@/v3/firestore/v2Backcompat";

export type UseSettingsResult = {
  settings: Settings | null;
  loading: boolean;
};

/**
 * V2 settings subscription. Flows the watcher payload through the V3 →
 * V2 back-compat shim so V2 surfaces (Dashboard, Tomorrow, History,
 * AppShell) continue to read Settings even after the Settings page
 * (PR #64) starts writing V3-shape docs. Removed when the last V2
 * surface cuts over to V3 hooks.
 */
export function useSettings(childId: string): UseSettingsResult {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return watchSettings(db, childId, (s) => {
      setSettings(withV2SettingsBackcompat(s));
      setLoading(false);
    });
  }, [childId]);

  return { settings, loading };
}
