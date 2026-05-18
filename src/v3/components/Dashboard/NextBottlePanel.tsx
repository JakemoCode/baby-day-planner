import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { formatTimeForDisplay, formatTimeShort } from "@/v3/ui/time";
import { OwnerPill } from "./OwnerPill";
import { bottleTotals, lastBottle } from "./dashboardStats";

export type NextBottlePanelProps = {
  nextBottle: Event | undefined;
  actuals: Event[];
  nowMinutes: TimeMin;
  owners: OwnersConfig;
};

function pluralBottles(n: number): string {
  return n === 1 ? "bottle" : "bottles";
}

export function NextBottlePanel({
  nextBottle,
  actuals,
  nowMinutes,
  owners,
}: NextBottlePanelProps) {
  const last = lastBottle(actuals);
  const totals = bottleTotals(actuals);

  return (
    <section aria-label="Bottle stats">
      <h3>Next bottle</h3>
      {nextBottle && (
        <p>
          Next bottle: {formatTimeForDisplay(nextBottle.startTime)}{" "}
          {nextBottle.owner && <OwnerPill owner={nextBottle.owner} owners={owners} />}
        </p>
      )}
      {last && (
        <p>
          Based on last bottle: {last.amountOz ?? 0}oz, {nowMinutes - last.startTime} min ago (
          {formatTimeShort(last.startTime)})
        </p>
      )}
      <p>
        Today: {totals.count} {pluralBottles(totals.count)}, {totals.oz}oz
      </p>
    </section>
  );
}
