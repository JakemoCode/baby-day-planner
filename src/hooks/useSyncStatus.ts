"use client";

import { useEffect, useState } from "react";
import { onSnapshotsInSync } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type UseSyncStatusResult = {
  online: boolean;
  lastSyncedAt: number | null;
};

export function useSyncStatus(): UseSyncStatusResult {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const unsub = onSnapshotsInSync(db, () => setLastSyncedAt(Date.now()));
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsub();
    };
  }, []);

  return { online, lastSyncedAt };
}
