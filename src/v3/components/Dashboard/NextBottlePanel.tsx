import type { Event, OwnersConfig } from "@/v3/schemas";
import { isRecorded } from "@/v3/schemas";
import { formatTimeForDisplay } from "@/v3/ui/time";
import { PreviewCard } from "./PreviewCard";

export type NextBottlePreviewProps = {
  bottle: Event | undefined;
  /** True when no Bottle 1 has been logged yet — show the start-of-day prompt. */
  bottle1Pending: boolean;
  owners: OwnersConfig;
  /** Most recent recorded bottle, shown as subtext when present. */
  lastBottle?: Event;
};

function formatOz(oz: number): string {
  return `${oz} oz`;
}

function formatLast(b: Event): string {
  const time = formatTimeForDisplay(b.startTime);
  return b.amountOz != null ? `Last: ${time} · ${formatOz(b.amountOz)}` : `Last: ${time}`;
}

export function NextBottlePreview({ bottle, bottle1Pending, lastBottle }: NextBottlePreviewProps) {
  const meta = lastBottle ? formatLast(lastBottle) : undefined;
  const metaProp = meta !== undefined ? { meta } : {};

  if (!bottle) {
    const message = bottle1Pending ? "Start first bottle for schedule" : "No more bottles today";
    return (
      <PreviewCard
        heading="Next bottle"
        ariaLabel="Next bottle"
        primary={null}
        emptyMessage={message}
        {...metaProp}
      />
    );
  }

  const recorded = isRecorded(bottle.lifecycle);
  const ozPart = bottle.amountOz != null ? formatOz(bottle.amountOz) : "";
  const subtitle = recorded
    ? `logged · ${ozPart} ${bottle.label}`.trim()
    : `projected · based on ${ozPart} ${bottle.label}`.trim();

  return (
    <PreviewCard
      heading="Next bottle"
      ariaLabel="Next bottle"
      primary={formatTimeForDisplay(bottle.startTime)}
      subtitle={subtitle}
      {...metaProp}
    />
  );
}
