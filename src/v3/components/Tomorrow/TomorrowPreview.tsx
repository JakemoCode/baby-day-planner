/**
 * V3 TomorrowPreview — renders TimelineV3 over the V3 engine output for
 * a synthesized planned Day. Tomorrow has no "now": no NowBar and no
 * dim-past. Mirrors the V2 component but on V3 types end-to-end.
 */

"use client";

import { useMemo } from "react";
import type { Day, Event, OwnersConfig, OwnershipTemplate, Settings } from "../../schemas";
import { projectDay } from "../../engine/projectDay";
import { TimelineV3 } from "../Timeline/TimelineV3";
import styles from "./TomorrowPreview.module.css";

export type TomorrowPreviewProps = {
  day: Day;
  settings: Settings;
  owners: OwnersConfig;
  template?: OwnershipTemplate;
  extras?: Event[];
  /** Tap a projected event in the preview (e.g., to assign an owner). */
  onEventTap?: (event: Event) => void;
};

export function TomorrowPreview({
  day,
  settings,
  owners,
  template,
  extras,
  onEventTap,
}: TomorrowPreviewProps) {
  const events = useMemo<Event[]>(() => {
    if (day.wakeTime === undefined) return [];
    return projectDay({
      day,
      settings,
      actuals: extras ?? [],
      ...(template ? { template } : {}),
    });
  }, [day, settings, template, extras]);

  if (day.wakeTime === undefined) {
    return (
      <div className={styles.empty} role="status">
        Set a wake time to preview tomorrow.
      </div>
    );
  }

  return (
    <TimelineV3
      events={events}
      owners={owners}
      putdownLeadMinutes={settings.putdownLeadMinutes}
      dimPast={false}
      {...(onEventTap ? { onEventTap } : {})}
    />
  );
}
