/**
 * TimelineV3 behavioural tests: V3 event shapes, putdown synthesis, owner ref resolution.
 * Owner color flows through `--owner-color` CSS custom property set inline by Block/InstantChip.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event, OwnersConfig } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { TimelineV3 } from "./TimelineV3";
import { expandPutdownBlocks } from "./expandPutdown";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake" },
  parent2: { displayName: "Sam" },
  other: [{ id: "daycare", displayName: "Daycare" }],
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
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("TimelineV3", () => {
  it("renders the empty state when no events", () => {
    render(<TimelineV3 events={[]} owners={owners} />);
    expect(screen.getByText("Nothing scheduled yet.")).toBeVisible();
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

  it("starts the viewport at the earliest event, not a fixed 5 AM floor", () => {
    // Wake at 7 AM, nothing earlier: the timeline should open at 7 AM, not pad
    // back to a 5 AM floor. First hour tick is 7A; there is no 5A tick.
    const events: Event[] = [ev({ id: "wake-nap", startTime: 7 * 60, endTime: 8 * 60 })];
    render(<TimelineV3 events={events} owners={owners} />);
    expect(screen.queryByText("5A")).toBeNull();
    expect(screen.queryByText("6A")).toBeNull();
    expect(screen.getByText("7A")).toBeVisible();
  });

  it("renders pre-expanded putdown blocks (callers must run renderProjection)", () => {
    // Expansion moved to renderProjection; TimelineV3 just paints what it receives.
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
    // getAttribute avoids jsdom normalizing hex to rgb().
    expect(block.getAttribute("style")).toContain("--owner-color: var(--color-owner-parent-1)");
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
    expect(chip.getAttribute("style")).toContain("--owner-color: var(--color-owner-3)");
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

  it("does NOT render the now-bar when nowMinutes is omitted", () => {
    render(<TimelineV3 events={[ev({ id: "nap1" })]} owners={owners} />);
    expect(screen.queryByTestId("now-line")).not.toBeInTheDocument();
    expect(screen.queryByTestId("now-pill")).not.toBeInTheDocument();
  });

  it("marks past blocks with data-past='true' when dimPast + nowMinutes provided", () => {
    // nap 9:00–10:00, now 11:00 → fully past
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
    // Doubling pxPerHour doubles the height (within rounding tolerance).
    expect(height120).toBeCloseTo(height60 * 2, 0);
  });

  it("renders a collapsed cluster when two instants would overlap vertically", async () => {
    const events: Event[] = [
      ev({
        id: "v",
        type: "daily_recurring",
        kind: "instant",
        startTime: 9 * 60 + 30,
        label: "Vitamin",
      }),
      ev({
        id: "d",
        type: "daily_recurring",
        kind: "instant",
        startTime: 9 * 60 + 35,
        label: "Diaper",
      }),
    ];
    render(<TimelineV3 events={events} owners={owners} />);
    // The two near-overlapping instants collapse into one chip.
    expect(screen.getByTestId("collapsed-instant-cluster")).toBeVisible();
    expect(screen.queryAllByTestId("instant-chip")).toHaveLength(0);
  });

  it("tapping the collapsed cluster opens a sheet listing both events", async () => {
    const events: Event[] = [
      ev({
        id: "v",
        type: "daily_recurring",
        kind: "instant",
        startTime: 9 * 60 + 30,
        label: "Vitamin",
      }),
      ev({
        id: "d",
        type: "daily_recurring",
        kind: "instant",
        startTime: 9 * 60 + 35,
        label: "Diaper",
      }),
    ];
    render(<TimelineV3 events={events} owners={owners} onEventTap={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /2 events/ }));
    // BottomSheet uses role="dialog"
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText("Vitamin")).toBeVisible();
    expect(screen.getByText("Diaper")).toBeVisible();
  });

  it("tapping a sheet row calls onEventTap with that event and closes the sheet", async () => {
    const onEventTap = vi.fn();
    const vitamin = ev({
      id: "v",
      type: "daily_recurring",
      kind: "instant",
      startTime: 9 * 60 + 30,
      label: "Vitamin",
    });
    const diaper = ev({
      id: "d",
      type: "daily_recurring",
      kind: "instant",
      startTime: 9 * 60 + 35,
      label: "Diaper",
    });
    render(<TimelineV3 events={[vitamin, diaper]} owners={owners} onEventTap={onEventTap} />);
    await userEvent.click(screen.getByRole("button", { name: /2 events/ }));
    await userEvent.click(screen.getByRole("button", { name: /Diaper/ }));
    expect(onEventTap).toHaveBeenCalledWith(diaper);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("chips far apart in time still render individually (no collapse)", () => {
    const events: Event[] = [
      ev({ id: "a", type: "bottle", kind: "instant", startTime: 9 * 60, label: "Bottle 1" }),
      ev({ id: "b", type: "bottle", kind: "instant", startTime: 13 * 60, label: "Bottle 2" }),
    ];
    render(<TimelineV3 events={events} owners={owners} />);
    expect(screen.queryByTestId("collapsed-instant-cluster")).toBeNull();
    expect(screen.queryAllByTestId("instant-chip")).toHaveLength(2);
  });

  // §F53: a recurring event WITH a duration (kind: block) is a custom user
  // event (e.g. a daily 3pm walk). It must share the right-hand custom column
  // with extras/pumps — not paint full-gutter-width behind the sleep cascade.
  it("recurring stays in the left custom column; extra-with-duration flips to the right band", () => {
    const recurring = ev({
      id: "walk",
      type: "daily_recurring",
      kind: "block",
      eventKey: "recurring_walk",
      startTime: 15 * 60,
      endTime: 15 * 60 + 30,
      label: "Walk",
    });
    const extra = ev({
      id: "x",
      type: "extra",
      kind: "block",
      eventKey: "extra_1",
      startTime: 10 * 60,
      endTime: 14 * 60,
      label: "Anything",
    });
    const nap = ev({ id: "n", type: "nap", startTime: 13 * 60, endTime: 14 * 60 });
    const { container } = render(<TimelineV3 events={[recurring, extra, nap]} owners={owners} />);
    const el = (type: string) => container.querySelector(`[data-type="${type}"]`) as HTMLElement;
    const leftOf = (type: string) => parseInt(el(type).style.left || "0", 10);
    // Recurring is inset to the custom column, well past the nap's full-gutter left.
    expect(leftOf("daily_recurring")).toBeGreaterThan(leftOf("nap"));
    // Extra-with-duration is a fixed-width band, right-anchored so its left
    // edge lands on the column break (no left edge set; width = 80px).
    expect(el("extra").style.left).toBe("");
    expect(el("extra").style.right).not.toBe("");
    expect(el("extra").style.width).toBe("80px");
  });

  // §F53: recurring duration blocks fell to the default z-tier (wake_window),
  // painting behind everything. They must paint above the wake-window background.
  it("paints a recurring duration block above an overlapping wake window", () => {
    const wake = ev({
      id: "ww",
      type: "wake_window",
      kind: "block",
      eventKey: "wake_window_1",
      startTime: 15 * 60,
      endTime: 16 * 60,
      label: "Wake Window",
    });
    const recurring = ev({
      id: "walk",
      type: "daily_recurring",
      kind: "block",
      eventKey: "recurring_walk",
      startTime: 15 * 60,
      endTime: 15 * 60 + 30,
      label: "Walk",
    });
    // Recurring first in input order so a no-op zOrder would leave it painted first (behind).
    const { container } = render(<TimelineV3 events={[recurring, wake]} owners={owners} />);
    const blocks = Array.from(container.querySelectorAll('[data-testid="timeline-block"]'));
    const idx = (type: string) => blocks.findIndex((b) => b.getAttribute("data-type") === type);
    // Later in DOM = painted on top.
    expect(idx("daily_recurring")).toBeGreaterThan(idx("wake_window"));
  });

  // §11.A wake-instant deduplication: WAIVED. V3 EventType has no "wake" event;
  // wake is derived from Day.wakeTime, so the V2 conflict class cannot be constructed.
});
