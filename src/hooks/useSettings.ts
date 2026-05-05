"use client";

import { useEffect, useState } from "react";
import type { Settings } from "@/domain";
import { db } from "@/lib/firebase/client";
import { watchSettings } from "@/repositories/settings";

export type UseSettingsResult = {
  settings: Settings | null;
  loading: boolean;
};

export function useSettings(childId: string): UseSettingsResult {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return watchSettings(db, childId, (s) => {
      setSettings(s);
      setLoading(false);
    });
  }, [childId]);

  return { settings, loading };
}
