"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { listTemplates } from "../repositories/templates";
import type { OwnershipTemplate } from "../schemas";

export type UseV3TemplatesResult = {
  templates: OwnershipTemplate[];
  loading: boolean;
};

export function useV3Templates(childId: string): UseV3TemplatesResult {
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
