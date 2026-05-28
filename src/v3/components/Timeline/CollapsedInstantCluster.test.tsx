/** Collapsed cluster chip for ≥2 overlapping instant events. Integration in TimelineV3.test.tsx. */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { CollapsedInstantCluster } from "./CollapsedInstantCluster";

const ev = (overrides: Partial<Event>): Event => ({
  id: "e",
  dayId: "d-1",
  eventKey: "x",
  type: "bottle",
  kind: "instant",
  startTime: 0,
  label: "x",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("CollapsedInstantCluster", () => {
  it("renders the event count as the primary label", () => {
    render(
      <CollapsedInstantCluster
        items={[ev({ id: "a" }), ev({ id: "b" })]}
        startMinutes={9 * 60 + 30}
        endMinutes={9 * 60 + 35}
        topPx={100}
        rightPx={4}
        widthPx={140}
        leaderWidthPx={8}
        past={false}
        onTap={() => {}}
      />,
    );
    expect(screen.getByText("2 events")).toBeVisible();
  });

  it("renders a time range when start and end differ", () => {
    render(
      <CollapsedInstantCluster
        items={[ev({ id: "a" }), ev({ id: "b" })]}
        startMinutes={9 * 60}
        endMinutes={9 * 60 + 5}
        topPx={100}
        rightPx={4}
        widthPx={140}
        leaderWidthPx={8}
        past={false}
        onTap={() => {}}
      />,
    );
    expect(screen.getByText(/9a.*9:05a/)).toBeVisible();
  });

  it("renders a single time when all members are at the exact same minute", () => {
    render(
      <CollapsedInstantCluster
        items={[ev({ id: "a" }), ev({ id: "b" })]}
        startMinutes={9 * 60 + 30}
        endMinutes={9 * 60 + 30}
        topPx={100}
        rightPx={4}
        widthPx={140}
        leaderWidthPx={8}
        past={false}
        onTap={() => {}}
      />,
    );
    expect(screen.getByText("9:30a")).toBeVisible();
  });

  it("invokes onTap when the user clicks the chip", async () => {
    const onTap = vi.fn();
    render(
      <CollapsedInstantCluster
        items={[ev({ id: "a" }), ev({ id: "b" })]}
        startMinutes={9 * 60}
        endMinutes={9 * 60 + 5}
        topPx={100}
        rightPx={4}
        widthPx={140}
        leaderWidthPx={8}
        past={false}
        onTap={onTap}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("exposes a descriptive aria-label that names the count + time range", () => {
    render(
      <CollapsedInstantCluster
        items={[ev({ id: "a" }), ev({ id: "b" }), ev({ id: "c" })]}
        startMinutes={9 * 60 + 30}
        endMinutes={9 * 60 + 40}
        topPx={100}
        rightPx={4}
        widthPx={140}
        leaderWidthPx={8}
        past={false}
        onTap={() => {}}
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-label", expect.stringContaining("3 events"));
    expect(btn).toHaveAttribute("aria-label", expect.stringContaining("9:30a"));
  });

  it("marks the cluster with data-past for the dim treatment", () => {
    render(
      <CollapsedInstantCluster
        items={[ev({ id: "a" }), ev({ id: "b" })]}
        startMinutes={9 * 60}
        endMinutes={9 * 60 + 5}
        topPx={100}
        rightPx={4}
        widthPx={140}
        leaderWidthPx={8}
        past={true}
        onTap={() => {}}
      />,
    );
    expect(screen.getByTestId("collapsed-instant-cluster")).toHaveAttribute("data-past", "true");
  });
});
