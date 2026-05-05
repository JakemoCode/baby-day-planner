"use client";

import { useEffect, useState } from "react";
import type { OwnershipTemplate } from "@/domain";
import { db } from "@/lib/firebase/client";
import { listTemplates } from "@/repositories/templates";

export type UseTemplatesResult = {
  templates: OwnershipTemplate[];
  loading: boolean;
};

export function useTemplates(childId: string): UseTemplatesResult {
  const [templates, setTemplates] = useState<OwnershipTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listTemplates(db, childId).then((tt) => {
      if (!cancelled) {
        setTemplates(tt);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  return { templates, loading };
}
