/**
 * Behavioural tests for TimelineV3. Coverage focuses on the V3 contract:
 * V3 event shapes render, putdown synthesis works end-to-end, owner refs
 * resolve to display strings + slot data attributes.
 *
 * Geometry parity with V2 is covered by the existing V2 tests. V3 owns
 * its own CSS modules now, with owner color flowing through the
 * `--owner-color` CSS custom property set inline by Block / InstantChip.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event, OwnersConfig } from "../../schemas";
import { TimelineV3 } from "./TimelineV3";
import { expandPutdownBlocks } from "./expandPutdown";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [{ id: "daycare", displayName: "Daycare", color: "#ccc" }],
};

const ev = (overrides: Partial<Event>): Event => ({
  id: "e",
  dayId: "d-1",
  eventKey: "x",
  type: "nap",
  kind: "block",
  startTime: 9 * 60,
  endTime: 10 * 60,
  label: "Nap 1",
  hasPutdown: false,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("TimelineV3", () => {
  it("renders the empty state when no events", () => {
    render(<TimelineV3 events={[]} owners={owners} />);
    expect(screen.getByText("Nothing scheduled yet.")).toBeInTheDocument();
  });

  it("renders block events and instant chips", () => {
    const events: Event[] = [
      ev({ id: "nap1" }),
      ev({
        id: "bot1",
        type: "bottle",
        kind: "instant",
        startTime: 7 * 60 + 30,
        label: "Bottle 1",
      }),
    ];
    render(<TimelineV3 events={events} owners={owners} />);
    expect(screen.getAllByTestId("timeline-block").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("instant-chip")).toBeInTheDocument();
  });

  it("renders pre-expanded putdown blocks (callers must run renderProjection)", () => {
    // Putdown expansion moved out of TimelineV3 into renderProjection.
    // The renderer just paints whatever it's given. Callers compose:
    //   renderProjection(events, settings, nowMinutes?) → TimelineV3
    const expanded = expandPutdownBlocks([ev({ id: "nap1", hasPutdown: true })], {
      putdownLeadMinutes: 15,
      defaultNapLengthMinutes: 60,
    });
    render(<TimelineV3 events={expanded} owners={owners} />);
    const blocks = screen.getAllByTestId("timeline-block");
    // 2 blocks: the synthetic putdown + the nap itself.
    expect(blocks).toHaveLength(2);
    expect(blocks.some((b) => b.getAttribute("data-type") === "putdown")).toBe(true);
  });

  it("encodes the owner slot via data-owner attributes", () => {
    const events: Event[] = [
      ev({ id: "nap1", owner: { slot: "parent1" } }),
      ev({
        id: "bot1",
        type: "bottle",
        kind: "instant",
        startTime: 7 * 60 + 30,
        label: "Bottle 1",
        owner: { slot: "other", otherId: "daycare" },
      }),
    ];
    render(<TimelineV3 events={events} owners={owners} />);
    const block = screen.getByTestId("timeline-block");
    expect(block).toHaveAttribute("data-owner", "parent1");
    const chip = screen.getByTestId("instant-chip");
    expect(chip).toHaveAttribute("data-owner", "other:daycare");
  });

  it("resolves owner refs to display names from OwnersConfig", () => {
    const events: Event[] = [ev({ id: "nap1", owner: { slot: "parent1" } })];
    render(<TimelineV3 events={events} owners={owners} />);
    expect(screen.getByText(/Jake/)).toBeInTheDocument();
  });

  it("sets --owner-color inline on blocks from the configured owner palette", () => {
    const events: Event[] = [ev({ id: "nap1", owner: { slot: "parent1" } })];
    render(<TimelineV3 events={events} owners={owners} />);
    const block = screen.getByTestId("timeline-block");
    // Read the raw style attribute — jsdom normalizes hex to rgb() when
    // accessed via .style, so assert against what the component emitted.
    expect(block.getAttribute("style")).toContain("--owner-color: #0af");
  });

  it("sets --owner-color inline on instant chips from the configured owner palette", () => {
    const events: Event[] = [
      ev({
        id: "bot1",
        type: "bottle",
        kind: "instant",
        startTime: 7 * 60 + 30,
        label: "Bottle 1",
        owner: { slot: "other", otherId: "daycare" },
      }),
    ];
    render(<TimelineV3 events={events} owners={owners} />);
    const chip = screen.getByTestId("instant-chip");
    expect(chip.getAttribute("style")).toContain("--owner-color: #ccc");
  });

  it("omits --owner-color when an event has no owner (CSS handles the fallback)", () => {
    const events: Event[] = [ev({ id: "nap1" })];
    render(<TimelineV3 events={events} owners={owners} />);
    const block = screen.getByTestId("timeline-block");
    expect(block.getAttribute("style") ?? "").not.toContain("--owner-color");
  });

  it("calls onEventTap with the parent event (never the synthetic putdown)", async () => {
    const onEventTap = vi.fn();
    const events: Event[] = [ev({ id: "nap1", hasPutdown: true })];
    const expanded = expandPutdownBlocks(events, {
      putdownLeadMinutes: 15,
      defaultNapLengthMinutes: 60,
    });
    render(<TimelineV3 events={expanded} owners={owners} onEventTap={onEventTap} />);
    const blocks = screen.getAllByTestId("timeline-block");
    const napBlock = blocks.find((b) => b.getAttribute("data-type") === "nap");
    const putdownBlock = blocks.find((b) => b.getAttribute("data-type") === "putdown");
    expect(napBlock?.tagName).toBe("BUTTON");
    expect(putdownBlock?.tagName).toBe("DIV");
    await userEvent.click(napBlock!);
    expect(onEventTap).toHaveBeenCalledTimes(1);
    expect(onEventTap).toHaveBeenCalledWith(events[0]);
  });

  it("renders the now-bar when nowMinutes is provided", () => {
    render(<TimelineV3 events={[ev({ id: "nap1" })]} owners={owners} nowMinutes={9 * 60 + 30} />);
    expect(screen.getByTestId("now-line")).toBeInTheDocument();
    expect(screen.getByTestId("now-pill")).toHaveTextContent("9:30a");
  });

  // §F9 PORT — coverage previously asserted in V2 timeline tests.

  it("does NOT render the now-bar when nowMinutes is omitted", () => {
    render(<TimelineV3 events={[ev({ id: "nap1" })]} owners={owners} />);
    expect(screen.queryByTestId("now-line")).not.toBeInTheDocument();
    expect(screen.queryByTestId("now-pill")).not.toBeInTheDocument();
  });

  it("marks past blocks with data-past='true' when dimPast + nowMinutes provided", () => {
    // Nap at 9:00–10:00; "now" is 11:00 → nap is fully in the past.
    render(
      <TimelineV3 events={[ev({ id: "nap1" })]} owners={owners} nowMinutes={11 * 60} dimPast />,
    );
    const block = screen.getByTestId("timeline-block");
    expect(block).toHaveAttribute("data-past", "true");
  });

  it("marks past instant clusters with data-past='true' when dimPast + nowMinutes provided", () => {
    const events: Event[] = [
      ev({
        id: "bot1",
        type: "bottle",
        kind: "instant",
        startTime: 7 * 60 + 30,
        label: "Bottle 1",
      }),
    ];
    render(<TimelineV3 events={events} owners={owners} nowMinutes={11 * 60} dimPast />);
    const cluster = screen.getByTestId("instant-cluster");
    expect(cluster).toHaveAttribute("data-past", "true");
  });

  it("respects pxPerHour — the timeline height scales proportionally", () => {
    const events: Event[] = [ev({ id: "nap1" })];
    const { rerender } = render(<TimelineV3 events={events} owners={owners} pxPerHour={60} />);
    const height60 = parseFloat(screen.getByTestId("timeline-inner").style.height);

    rerender(<TimelineV3 events={events} owners={owners} pxPerHour={120} />);
    const height120 = parseFloat(screen.getByTestId("timeline-inner").style.height);

    expect(height60).toBeGreaterThan(0);
    // Doubling pxPerHour doubles the rendered height (within rounding tolerance).
    expect(height120).toBeCloseTo(height60 * 2, 0);
  });

  // §11.A wake-instant deduplication: WAIVED. V3's EventType union does not
  // include "wake" (per src/v3/schemas.ts — wake is derived from Day.wakeTime,
  // never a top-level event), so the conflict the V2 test guarded against
  // cannot be constructed with valid V3 data. The architecture removes the
  // bug class entirely.
});
