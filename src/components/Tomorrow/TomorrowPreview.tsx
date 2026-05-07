import { useMemo } from "react";
import type { Day, Event, OwnershipTemplate, Settings } from "@/domain";
import { makeEvent, projectDay } from "@/domain";
import { TimelineList } from "@/components/Timeline/TimelineList";
import styles from "./TomorrowPreview.module.css";

export type TomorrowPreviewProps = {
  day: Day;
  settings: Settings;
  template?: OwnershipTemplate;
  extras?: Event[];
  /** Optional Bottle 1 time to seed the chain projection. */
  bottle1Time?: string;
  /** Tap a projected event in the preview (e.g., to assign an owner). */
  onEventTap?: (event: Event) => void;
};

export function TomorrowPreview({
  day,
  settings,
  template,
  extras = [],
  bottle1Time,
  onEventTap,
}: TomorrowPreviewProps) {
  const events = useMemo(() => {
    if (!day.wakeTime) return [];
    const actuals: Event[] = [...extras];
    if (bottle1Time) {
      actuals.push(
        makeEvent({
          id: `${day.id}-planned-bottle-1`,
          dayId: day.id,
          eventKey: "bottle_1",
          type: "bottle",
          label: "Bottle 1",
          startTime: bottle1Time,
          amountOz: settings.defaultBottleAmountOz,
          source: "manual",
          status: "overridden",
        }),
      );
    }
    return projectDay({
      day,
      settings,
      actuals,
      ...(template ? { template } : {}),
    });
  }, [day, settings, template, extras, bottle1Time]);

  if (!day.wakeTime) {
    return (
      <div className={styles.empty} role="status">
        Set a wake time to preview tomorrow.
      </div>
    );
  }

  return <TimelineList events={events} {...(onEventTap ? { onEventTap } : {})} />;
}
