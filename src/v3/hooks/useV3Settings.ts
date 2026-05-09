"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { watchSettings } from "../repositories/settings";
import type { Settings } from "../schemas";

export type UseV3SettingsResult = {
  settings: Settings | null;
  loading: boolean;
};

export function useV3Settings(childId: string): UseV3SettingsResult {
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
