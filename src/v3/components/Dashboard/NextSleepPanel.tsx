import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { formatHoursMinutes, formatTimeForDisplay } from "@/v3/ui/time";
import { OwnerPill } from "./OwnerPill";
import { PreviewCard } from "./PreviewCard";

export type NextNapPreviewProps = {
  nap: Event | undefined;
  owners: OwnersConfig;
  /** Most recent recorded nap, shown as subtext when present. */
  lastNap?: Event;
  /** Projected bedtime event. Replaces empty state when no more naps. */
  bedtime?: Event;
};

/**
 * Render a nap as either "9:45–10:30 AM" (range) or "9:45 AM" (in-progress).
 * Drops AM/PM from the start when both ends share the same period.
 */
function formatNapRange(start: TimeMin, end: TimeMin | undefined): string {
  if (end === undefined) return formatTimeForDisplay(start);
  const startStr = formatTimeForDisplay(start);
  const endStr = formatTimeForDisplay(end);
  const startPeriod = startStr.slice(-2);
  const endPeriod = endStr.slice(-2);
  if (startPeriod === endPeriod) {
    return `${startStr.replace(/\s(AM|PM)$/, "")}–${endStr}`;
  }
  return `${startStr} – ${endStr}`;
}

function formatLast(n: Event): string {
  if (n.endTime === undefined) {
    return `Last: started ${formatTimeForDisplay(n.startTime)} · in progress`;
  }
  return `Last: ${formatNapRange(n.startTime, n.endTime)} · ${formatHoursMinutes(n.endTime - n.startTime)}`;
}

export function NextNapPreview({ nap, owners, lastNap, bedtime }: NextNapPreviewProps) {
  const meta = lastNap ? formatLast(lastNap) : undefined;

  if (!nap) {
    if (bedtime) {
      return (
        <PreviewCard
          heading="Next nap"
          ariaLabel="Next nap"
          primary={`Bedtime at ${formatTimeForDisplay(bedtime.startTime)}`}
          {...(meta !== undefined ? { meta } : {})}
        />
      );
    }
    return (
      <PreviewCard
        heading="Next nap"
        ariaLabel="Next nap"
        primary={null}
        emptyMessage="No more naps today"
        {...(meta !== undefined ? { meta } : {})}
      />
    );
  }

  const range = formatNapRange(nap.startTime, nap.endTime);
  const subtitle = nap.owner ? (
    <>
      {nap.label} <OwnerPill owner={nap.owner} owners={owners} />
    </>
  ) : (
    nap.label
  );

  return (
    <PreviewCard
      heading="Next nap"
      ariaLabel="Next nap"
      primary={range}
      subtitle={subtitle}
      {...(meta !== undefined ? { meta } : {})}
    />
  );
}
