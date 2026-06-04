/**
 * EventEditDrawerV3 — rendering + integration: field visibility by type,
 * onSave payload shape, validation. Lifecycle math covered in formToEvent.test.ts.
 */

import React, { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event, OwnersConfig, TimeMin } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { useDrawer } from "../../hooks/useDrawer";
import { EventEditDrawerV3 } from "./EventEditDrawerV3";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [],
};

const NOW = 8 * 60 + 30;
const THRESHOLD = 19 * 60; // 7:00 PM — well past existing test scenarios.
const DEFAULT_WAKE_TIME = 7 * 60; // 7:00 AM next day = 1860 in cross-day TimeMin

const projectedNap = (overrides: Partial<Event> = {}): Event => ({
  id: "nap-1",
  dayId: "d-1",
  eventKey: "nap_1",
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

const projectedBottle = (overrides: Partial<Event> = {}): Event => ({
  id: "bot-1",
  dayId: "d-1",
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  startTime: 7 * 60 + 30,
  label: "Bottle 1",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

const projectedPump = (overrides: Partial<Event> = {}): Event => ({
  id: "pump-1",
  dayId: "d-1",
  eventKey: "pump_1",
  type: "pump",
  kind: "block",
  startTime: 8 * 60,
  endTime: 8 * 60 + 20,
  label: "Pump",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

const recordedBottleNeighbor = (overrides: Partial<Event> = {}): Event => ({
  ...projectedBottle({ startTime: 8 * 60 }),
  id: "bottle-other",
  eventKey: "bottle_2",
  label: "Bottle 2",
  lifecycle: { state: "completed", committedAt: 8 * 60 },
  ...overrides,
});

describe("EventEditDrawerV3", () => {
  it("returns null when closed", () => {
    const { container } = render(
      <EventEditDrawerV3
        open={false}
        mode="edit"
        event={projectedNap()}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows start + end inputs for a nap", () => {
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedNap()}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByLabelText("Start time")).toHaveValue("09:00");
    expect(screen.getByLabelText("End time")).toHaveValue("10:00");
  });

  it("shows amount input for a bottle but no end-time input", () => {
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedBottle()}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByLabelText("Amount (oz)")).toHaveValue(null);
    expect(screen.queryByLabelText("End time")).not.toBeInTheDocument();
  });

  it("drawer heading for a bottle includes its chronological number", () => {
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedBottle({ label: "Bottle 3" })}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Edit Bottle 3");
  });

  it("drawer heading for a nap includes its number", () => {
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedNap({ label: "Nap 2" })}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Edit Nap 2");
  });

  it("drawer heading for a recurring event includes the event label", () => {
    const recurring: Event = {
      id: "rec-1",
      dayId: "d-1",
      eventKey: "recurring_tummy",
      type: "daily_recurring",
      kind: "instant",
      startTime: 10 * 60,
      label: "Tummy time",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={recurring}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Tummy time");
  });

  it("shows the owner picker on a daily_recurring event and carries the selection on save", async () => {
    const onSave = vi.fn();
    const recurring: Event = {
      id: "rec-1",
      dayId: "d-1",
      eventKey: "recurring_meds",
      type: "daily_recurring",
      kind: "instant",
      startTime: 8 * 60,
      label: "Morning meds",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={recurring}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Jake" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const next: Event = onSave.mock.calls[0]![0];
    expect(next.owner).toEqual({ slot: "parent1" });
    expect(next.type).toBe("daily_recurring");
  });

  it("saves owner-only edit as overridden lifecycle", async () => {
    const onSave = vi.fn();
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedNap()}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Jake" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const next: Event = onSave.mock.calls[0]![0];
    expect(next.owner).toEqual({ slot: "parent1" });
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("saves nap time edit as overridden lifecycle (predict-don't-prescribe: drawer is scheduling intent, not reality)", async () => {
    const onSave = vi.fn();
    // Use a recorded nap so time inputs are enabled (future-projected events are locked).
    const source = projectedNap({
      lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
    });
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={source}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    const start = screen.getByLabelText("Start time");
    await userEvent.clear(start);
    await userEvent.type(start, "09:05");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const next: Event = onSave.mock.calls[0]![0];
    expect(next.startTime).toBe(9 * 60 + 5);
    // Recorded + scheduling-type time edit → stays recorded with new annotation.
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("blocks save when end time is not after start time", async () => {
    const onSave = vi.fn();
    // Use a recorded event — projected future events have disabled time inputs.
    const recorded = projectedNap({
      lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
    });
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={recorded}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    const end = screen.getByLabelText("End time");
    await userEvent.clear(end);
    await userEvent.type(end, "08:30");
    expect(screen.getByRole("alert")).toHaveTextContent(/after start time/i);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("flags overlap with a recorded nap on the same day", async () => {
    const recordedNap: Event = {
      id: "nap-other",
      dayId: "d-1",
      eventKey: "nap_2",
      type: "nap",
      kind: "block",
      startTime: 9 * 60 + 30,
      endTime: 11 * 60,
      label: "Nap 2",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "completed", committedAt: 11 * 60 },
    };
    // Use recorded lifecycle so time inputs are enabled; edit start to 9:00 introduces overlap.
    const source = projectedNap({
      startTime: 11 * 60 + 30,
      endTime: 12 * 60,
      lifecycle: { state: "recorded", annotatedAt: 11 * 60 + 30 },
    });
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={source}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        existingEvents={[recordedNap]}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const start = screen.getByLabelText("Start time");
    await userEvent.clear(start);
    await userEvent.type(start, "09:00");
    expect(screen.getByRole("alert")).toHaveTextContent(/Overlaps Nap 2/);
  });

  it("flags overlap with a recorded pump on the same day", async () => {
    const recordedPump: Event = {
      id: "pump-other",
      dayId: "d-1",
      eventKey: "pump_2",
      type: "pump",
      kind: "block",
      startTime: 8 * 60,
      endTime: 8 * 60 + 30,
      label: "Pump 2",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "completed", committedAt: 8 * 60 + 30 },
    };
    const source = projectedPump({
      startTime: 10 * 60,
      endTime: 10 * 60 + 20,
      lifecycle: { state: "recorded", annotatedAt: 10 * 60 },
    });
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={source}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        existingEvents={[recordedPump]}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const start = screen.getByLabelText("Start time");
    await userEvent.clear(start);
    await userEvent.type(start, "08:10");
    expect(screen.getByRole("alert")).toHaveTextContent(/Overlaps Pump 2/);
  });

  it("flags a bottle logged within 10 minutes of a recorded bottle", async () => {
    const source = projectedBottle({
      startTime: 12 * 60,
      lifecycle: { state: "recorded", annotatedAt: 12 * 60 },
    });
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={source}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        existingEvents={[recordedBottleNeighbor()]}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const start = screen.getByLabelText("Start time");
    await userEvent.clear(start);
    await userEvent.type(start, "08:05");
    expect(screen.getByRole("alert")).toHaveTextContent(/Within 10 min of Bottle 2/);
  });

  it("flags a bottle across the midnight wrap (11:58 PM neighbor, edit to 12:01 AM)", async () => {
    const recordedBottle = recordedBottleNeighbor({ startTime: 23 * 60 + 58 });
    const source = projectedBottle({
      startTime: 12 * 60,
      lifecycle: { state: "recorded", annotatedAt: 12 * 60 },
    });
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={source}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        existingEvents={[recordedBottle]}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const start = screen.getByLabelText("Start time");
    await userEvent.clear(start);
    await userEvent.type(start, "00:01");
    expect(screen.getByRole("alert")).toHaveTextContent(/Within 10 min of Bottle 2/);
  });

  it("does not flag a bottle exactly 10 minutes from another bottle", async () => {
    const source = projectedBottle({
      startTime: 12 * 60,
      lifecycle: { state: "recorded", annotatedAt: 12 * 60 },
    });
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={source}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        existingEvents={[recordedBottleNeighbor()]}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const start = screen.getByLabelText("Start time");
    await userEvent.clear(start);
    await userEvent.type(start, "08:10");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("flags startTime < dayWakeTime as a pre-wake error (AM/PM safeguard)", async () => {
    // AM/PM mistake (e.g. 0:30 instead of 12:30) silently wrecks the cascade; validator must catch it.
    const recorded = projectedNap({
      lifecycle: { state: "recorded", annotatedAt: 11 * 60 + 30 },
      startTime: 11 * 60 + 30,
      endTime: 12 * 60 + 30,
    });
    const onSave = vi.fn();
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={recorded}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        dayWakeTime={7 * 60}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    const start = screen.getByLabelText("Start time");
    await userEvent.clear(start);
    await userEvent.type(start, "00:30"); // 0:30 am — the AM/PM mistake
    expect(screen.getByRole("alert")).toHaveTextContent(/before today's wake time/i);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("B7 pre-wake guard does NOT flag startTime === dayWakeTime (boundary)", async () => {
    // Guard is strict `<`; pins that startTime === wakeTime is not rejected (regression to `<=`).
    const recorded = projectedNap({
      lifecycle: { state: "recorded", annotatedAt: 11 * 60 + 30 },
      startTime: 11 * 60 + 30,
      endTime: 12 * 60 + 30,
    });
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={recorded}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        dayWakeTime={7 * 60}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const start = screen.getByLabelText("Start time");
    await userEvent.clear(start);
    await userEvent.type(start, "07:00"); // exactly at dayWakeTime
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("B7 pre-wake guard does NOT block a pre-wake daily_recurring (review-found false positive)", async () => {
    // daily_recurring is explicit-schedule (not cascade); legitimate to schedule pre-wake (e.g. 5am medication).
    const preWakeRecurring: Event = {
      id: "proj_recurring:rec-medication",
      dayId: "d-1",
      eventKey: "recurring:rec-medication",
      type: "daily_recurring",
      kind: "instant",
      startTime: 5 * 60 + 30, // 5:30am, before wakeTime 7:00
      label: "Medication",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={preWakeRecurring}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        dayWakeTime={7 * 60}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("B7 pre-wake guard does NOT block an overnight bottle (DOMAIN.md §overnight-bottles)", async () => {
    // Babies wake overnight to feed. Per DOMAIN.md, an overnight bottle
    // (startTime < wakeTime) is normal and does NOT anchor the cascade —
    // the engine already filters anchors to startTime >= wakeTime. The
    // B7 guard's AM/PM rationale is nap-specific; for a bottle a pre-wake
    // time is indistinguishable from (and usually IS) a real 4am feed, so
    // the validator must not block it.
    const recorded = projectedBottle({
      lifecycle: { state: "recorded", annotatedAt: 7 * 60 + 30 },
      startTime: 7 * 60 + 30,
    });
    const onSave = vi.fn();
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={recorded}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        dayWakeTime={7 * 60}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    const start = screen.getByLabelText("Start time");
    await userEvent.clear(start);
    await userEvent.type(start, "04:07"); // 4:07am overnight feed
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("does not flag overlap against a render-synthetic putdown chip", async () => {
    // Synthetic putdown carries type="nap" for layout; validator skips eventKey===PUTDOWN_KIND_TAG.
    const putdownSynthetic: Event = {
      id: "putdown:nap-2",
      dayId: "d-1",
      eventKey: "__putdown__", // PUTDOWN_KIND_TAG sentinel
      type: "nap",
      kind: "block",
      label: "Putdown",
      startTime: 11 * 60,
      endTime: 11 * 60 + 15,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "recorded", annotatedAt: 11 * 60 },
    };
    // Source is a recorded nap right after the putdown — editing
    // its end-time should NOT flag the synthetic putdown as overlap.
    const source = projectedNap({
      lifecycle: { state: "recorded", annotatedAt: 11 * 60 + 15 },
      startTime: 11 * 60 + 15,
      endTime: 12 * 60,
    });
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={source}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        existingEvents={[putdownSynthetic]}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const end = screen.getByLabelText("End time");
    await userEvent.clear(end);
    await userEvent.type(end, "12:30");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not flag overlap against still-projected events", async () => {
    const projectedOther = projectedNap({ id: "other", startTime: 9 * 60 + 30, label: "Nap 2" });
    // Recorded source → time inputs editable.
    const source = projectedNap({
      lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
    });
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={source}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        existingEvents={[projectedOther]}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const end = screen.getByLabelText("End time");
    await userEvent.clear(end);
    await userEvent.type(end, "10:30");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls onCancel on Cancel + Escape", async () => {
    const onCancel = vi.fn();
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedNap()}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("delete button is hidden for projected events", () => {
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedNap()}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  // Re-edits of a recorded event must update the existing doc, not create a duplicate.
  // Mirrors the page's actuals-membership routing contract.
  it("re-edit of an overridden actual routes to update, not create (actuals-membership)", async () => {
    const overriddenNap: Event = {
      id: "manual-X",
      dayId: "d-1",
      eventKey: "nap_2",
      type: "nap",
      kind: "block",
      startTime: 11 * 60,
      endTime: 12 * 60,
      label: "Nap 2",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "recorded", annotatedAt: 10 * 60 },
    };
    const actuals: Event[] = [overriddenNap];
    const createOptimistic = vi.fn();
    const updateOptimistic = vi.fn();

    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={overriddenNap}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={async (event) => {
          // Mirror the page's `actuals.some(a => a.id === drawer.event.id)` check.
          const exists = actuals.some((a) => a.id === event.id);
          if (exists) {
            await updateOptimistic(event.id, event);
          } else {
            await createOptimistic({ ...event, id: "manual-NEW" });
          }
        }}
        onCancel={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Sam" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateOptimistic).toHaveBeenCalledTimes(1);
    expect(updateOptimistic.mock.calls[0]![0]).toBe("manual-X");
    const next: Event = updateOptimistic.mock.calls[0]![1];
    expect(next.id).toBe("manual-X");
    expect(next.owner).toEqual({ slot: "parent2" });
    // Already-recorded keeps its original annotatedAt; only projected→recorded stamps NOW.
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: 10 * 60 });
    expect(createOptimistic).not.toHaveBeenCalled();
  });

  it("delete button is shown for a user-created one-off event (extra)", () => {
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedNap({
          type: "extra",
          id: "extra_uuid",
          eventKey: "extra_uuid",
          lifecycle: { state: "completed", committedAt: 10 * 60 },
        })}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
  });

  // §F71: a recorded rhythm slot reverts to projection — labelled "Reset", not "Delete".
  it("shows Reset (not Delete) for a recorded nap in its cascade slot", () => {
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedNap({
          id: "recorded_nap_1",
          eventKey: "nap_1",
          lifecycle: { state: "recorded", annotatedAt: 10 * 60 },
        })}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Reset" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  // §F70: an auto-promoted wake_window has a proj_ id (no doc) — no destructive button at all.
  it("shows no destructive button for an auto-promoted wake_window", () => {
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedNap({
          type: "wake_window",
          id: "proj_wake_window_2",
          eventKey: "wake_window_2",
          lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
        })}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });

  it("Reset routes through onDelete after the 'Reset to projected time?' confirm", async () => {
    const onDelete = vi.fn();
    const recordedBottle = projectedBottle({
      id: "recorded_bottle_t600",
      eventKey: "bottle_2",
      startTime: 10 * 60,
      lifecycle: { state: "recorded", annotatedAt: 10 * 60 },
    });
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={recordedBottle}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={onDelete}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    const dialog = screen.getByRole("dialog", { name: "Reset to projected time?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Reset" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete.mock.calls[0]![0]).toMatchObject({ id: "recorded_bottle_t600" });
  });

  it("Reset (not Delete) is shown for a recorded cascade bottle whose time was edited (§F66)", () => {
    // The recorded_bottle_t* doc id is frozen at the original startTime; a later
    // time-edit moves startTime but keeps the id, so reset-detection must key off
    // the id pattern. It stays a rhythm slot → Reset.
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedBottle({
          id: "recorded_bottle_t600", // first recorded at 10:00
          eventKey: "bottle_2",
          startTime: 11 * 60, // user edited the time to 11:00
          lifecycle: { state: "recorded", annotatedAt: 11 * 60 },
        })}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Reset" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("delete button is SHOWN for a user-added one-off bottle (uuid id, lifecycle completed)", () => {
    // A FAB-created bottle has a uuid id (newEventId), not the deterministic
    // recorded_bottle_t* — it's a genuine one-off the user must be able to delete.
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedBottle({
          id: "bottle_9f3c-uuid",
          startTime: 14 * 60,
          lifecycle: { state: "completed", committedAt: 14 * 60 },
        })}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
  });

  it("delete button is HIDDEN for an auto-promoted nap (proj_ id + recorded lifecycle)", () => {
    // Auto-promoted nap has no Firestore doc; engine re-emits it next pass so Delete is a visual no-op.
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedNap({
          id: "proj_nap_1",
          lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
        })}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("delete button is shown for a PROJECTED daily_recurring event", () => {
    const recurring: Event = {
      id: "proj_recurring:rec-tummy",
      dayId: "d-1",
      eventKey: "recurring:rec-tummy",
      type: "daily_recurring",
      kind: "instant",
      startTime: 10 * 60,
      label: "Tummy time",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={recurring}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
  });

  it("delete confirmation for a daily_recurring uses skip-today copy", async () => {
    const recurring: Event = {
      id: "proj_recurring:rec-tummy",
      dayId: "d-1",
      eventKey: "recurring:rec-tummy",
      type: "daily_recurring",
      kind: "instant",
      startTime: 10 * 60,
      label: "Tummy time",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={recurring}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    // ConfirmDialog may use alertdialog or dialog role.
    expect(screen.getByText(/Skip Tummy time today/i)).toBeVisible();
    expect(screen.getByText(/come back tomorrow/i)).toBeVisible();
  });

  // Per-type form field coverage.

  it("wake_window form shows only the owner picker (no time / amount / label inputs)", () => {
    const ww: Event = {
      id: "ww-1",
      dayId: "d-1",
      eventKey: "wake_window_1",
      type: "wake_window",
      kind: "block",
      startTime: 8 * 60,
      endTime: 9 * 60,
      label: "Wake window 1",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={ww}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByLabelText("Start time")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("End time")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Amount (oz)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Label")).not.toBeInTheDocument();
    // Assert via group role to avoid false-positive from stray "Jake" buttons.
    const ownerGroup = screen.getByRole("group", { name: /owner/i });
    expect(within(ownerGroup).getByRole("button", { name: "Jake" })).toBeInTheDocument();
    expect(within(ownerGroup).getByRole("button", { name: "Sam" })).toBeInTheDocument();
  });

  it("extra form shows label + start + end + owner picker", () => {
    const extra: Event = {
      id: "extra-1",
      dayId: "d-1",
      eventKey: "extra-1",
      type: "extra",
      kind: "block",
      startTime: 14 * 60,
      endTime: 15 * 60,
      label: "Pediatrician",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={extra}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByLabelText("Label")).toHaveValue("Pediatrician");
    expect(screen.getByLabelText("Start time")).toHaveValue("14:00");
    expect(screen.getByLabelText("End time")).toHaveValue("15:00");
    expect(screen.queryByLabelText("Amount (oz)")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jake" })).toBeInTheDocument();
  });

  // Daycare owner is per-event (drawer); earlier `showOwner` flag silently excluded both types.
  it.each(["daycare_dropoff", "daycare_pickup"] as const)(
    "%s form shows the owner picker",
    (type) => {
      const evt: Event = {
        id: `${type}-1`,
        dayId: "d-1",
        eventKey: type,
        type,
        kind: "instant",
        startTime: 8 * 60,
        label: type === "daycare_dropoff" ? "Daycare dropoff" : "Daycare pickup",
        hasPutdown: false,
        owner: NO_OWNER,
        lifecycle: { state: "projected" },
      };
      render(
        <EventEditDrawerV3
          open
          mode="edit"
          event={evt}
          owners={owners}
          nowMinutes={NOW}
          bedtimeThreshold={THRESHOLD}
          defaultWakeTime={DEFAULT_WAKE_TIME}
          onSave={() => {}}
          onCancel={() => {}}
        />,
      );
      const ownerGroup = screen.getByRole("group", { name: /owner/i });
      expect(within(ownerGroup).getByRole("button", { name: "Jake" })).toBeVisible();
      expect(within(ownerGroup).getByRole("button", { name: "Sam" })).toBeVisible();
    },
  );
});

describe("Past-threshold prompt when editing a nap (physiology cascade)", () => {
  // Nap crossing bedtimeThreshold prompts "Change to bedtime?". Yes → delete nap + save bedtime. No → save as nap.

  const recordedNap = (start: TimeMin, end: TimeMin): Event => ({
    id: "nap-rec",
    dayId: "d-1",
    eventKey: "nap_2",
    type: "nap",
    kind: "block",
    startTime: start,
    endTime: end,
    label: "Nap 2",
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "completed", committedAt: start },
  });

  it("does not prompt when nap stays below threshold", async () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={recordedNap(9 * 60, 10 * 60)}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={onDelete}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ type: "nap" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText(/change to bedtime\?/i)).toBeNull();
  });

  it("prompts when nap crosses to past-threshold; Yes deletes nap + saves bedtime", async () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const original = recordedNap(9 * 60, 10 * 60);
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={original}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={onDelete}
      />,
    );
    // Move nap startTime to 20:00 (past threshold 19:00).
    const startInput = screen.getByLabelText("Start time");
    await userEvent.clear(startInput);
    await userEvent.type(startInput, "20:00");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    // Prompt appears.
    expect(screen.getByText(/change to bedtime\?/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /yes, change to bedtime/i }));
    // Original nap doc deleted; bedtime doc saved.
    expect(onDelete).toHaveBeenCalledWith(original);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "bedtime",
        eventKey: "bedtime",
        startTime: 20 * 60,
        label: "Bedtime",
        // DOMAIN.md §3: endTime = defaultWakeTime + 24h; source nap's endTime dropped.
        endTime: DEFAULT_WAKE_TIME + 24 * 60,
        // recorded triggers putdown synthesis and manualBedtime cascade path.
        lifecycle: expect.objectContaining({ state: "recorded" }),
      }),
    );
  });

  it("prompts on cross; No saves as nap, no delete", async () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={recordedNap(9 * 60, 10 * 60)}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={onDelete}
      />,
    );
    const startInput = screen.getByLabelText("Start time");
    await userEvent.clear(startInput);
    await userEvent.type(startInput, "20:00");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await userEvent.click(screen.getByRole("button", { name: /no, keep as nap/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ type: "nap", startTime: 20 * 60 }),
    );
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("Escape dismisses the prompt without saving (returns to drawer)", async () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={recordedNap(9 * 60, 10 * 60)}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={onDelete}
      />,
    );
    const startInput = screen.getByLabelText("Start time");
    await userEvent.clear(startInput);
    await userEvent.type(startInput, "20:00");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/change to bedtime\?/i)).toBeVisible();
    // Escape dismisses without saving or deleting.
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText(/change to bedtime\?/i)).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("does not prompt when nap was already past threshold (owner-only edit)", async () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={recordedNap(20 * 60, 21 * 60)} // already past 19:00
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={onDelete}
      />,
    );
    // No time change; just save.
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.queryByText(/change to bedtime\?/i)).toBeNull();
    expect(onSave).toHaveBeenCalled();
  });

  describe("future-event drawer rule (ADR-0001)", () => {
    const futureNap = () =>
      projectedNap({
        id: "proj_nap_3",
        eventKey: "nap_3",
        startTime: 14 * 60,
        endTime: 14 * 60 + 45,
        label: "Nap 3",
      });

    const futureBottle = () =>
      projectedBottle({
        id: "bot-future",
        eventKey: "bottle_4",
        startTime: 13 * 60,
        amountOz: 6,
        label: "Bottle 4",
      });

    type DrawerProps = React.ComponentProps<typeof EventEditDrawerV3>;
    const renderDrawer = (overrides: Partial<DrawerProps> = {}) =>
      render(
        <EventEditDrawerV3
          open
          mode="edit"
          event={futureNap()}
          owners={owners}
          nowMinutes={NOW}
          bedtimeThreshold={THRESHOLD}
          defaultWakeTime={DEFAULT_WAKE_TIME}
          onSave={() => {}}
          onCancel={() => {}}
          {...overrides}
        />,
      );

    it("disables start time, end time, and amount inputs on a future projected event", () => {
      renderDrawer();
      expect(screen.getByLabelText(/start time/i)).toBeDisabled();
      expect(screen.getByLabelText(/end time/i)).toBeDisabled();
    });

    it("disables amount input on a future projected bottle but keeps owner editable", () => {
      renderDrawer({ event: futureBottle() });
      expect(screen.getByLabelText(/amount/i)).toBeDisabled();
      // OwnerPickerV3 uses buttons, not a labeled input; picker has its own coverage.
      const ownerButtons = screen
        .getAllByRole("button")
        .filter((btn) => /jake|sam|no owner/i.test(btn.textContent ?? ""));
      expect(ownerButtons.length).toBeGreaterThan(0);
      expect(ownerButtons[0]).not.toBeDisabled();
    });

    it("renders an explanatory hint for future-projected events", () => {
      renderDrawer();
      expect(screen.getByRole("note")).toHaveTextContent(/only the owner is editable/i);
    });

    it("does NOT disable inputs when the projected event's startTime has passed (drawer reverts to normal recorded-edit flow)", () => {
      const pastProjected = projectedNap({
        id: "nap-past",
        eventKey: "nap_2",
        startTime: NOW - 60, // 1hr before Now
        endTime: NOW - 15,
      });
      renderDrawer({ event: pastProjected });
      expect(screen.getByLabelText(/start time/i)).not.toBeDisabled();
    });

    it("does NOT disable inputs when editing a recorded event whose startTime is in the future (planning-intent edits stay open)", () => {
      const recordedFuture = projectedNap({
        id: "nap-recorded",
        startTime: 14 * 60,
        endTime: 14 * 60 + 45,
        lifecycle: { state: "recorded", annotatedAt: 14 * 60 },
      });
      renderDrawer({ event: recordedFuture });
      expect(screen.getByLabelText(/start time/i)).not.toBeDisabled();
      expect(screen.queryByRole("note")).toBeNull();
    });

    it("does NOT disable inputs in create mode (form fields are the source of truth)", () => {
      renderDrawer({ mode: "create" });
      expect(screen.getByLabelText(/start time/i)).not.toBeDisabled();
    });

    it("chronologically-NEXT projected nap is editable (sick-day flex)", () => {
      // Earliest future projected nap is editable; later ones stay locked (cascade re-projects from pin).
      const nap2 = projectedNap({
        id: "nap-2",
        eventKey: "nap_2",
        startTime: 14 * 60,
        endTime: 14 * 60 + 45,
      });
      const nap3 = projectedNap({
        id: "nap-3",
        eventKey: "nap_3",
        startTime: 16 * 60,
        endTime: 16 * 60 + 45,
      });
      renderDrawer({ event: nap2, existingEvents: [nap2, nap3] });
      expect(screen.getByLabelText("Start time")).not.toBeDisabled();
      expect(screen.queryByRole("note")).toBeNull();
    });

    it("farther-out projected nap stays locked (cascade re-projects from the pin)", () => {
      const nap2 = projectedNap({
        id: "nap-2",
        eventKey: "nap_2",
        startTime: 14 * 60,
        endTime: 14 * 60 + 45,
      });
      const nap3 = projectedNap({
        id: "nap-3",
        eventKey: "nap_3",
        startTime: 16 * 60,
        endTime: 16 * 60 + 45,
      });
      renderDrawer({ event: nap3, existingEvents: [nap2, nap3] });
      expect(screen.getByLabelText("Start time")).toBeDisabled();
      expect(screen.getByRole("note")).toBeVisible();
    });

    it("sanitizes the save payload back to source values even if the form somehow holds different time/amount", async () => {
      // Defense-in-depth: payload startTime/endTime must equal source regardless of form state.
      const onSave = vi.fn();
      const source = futureNap();
      renderDrawer({ event: source, onSave });
      const jakeBtn = screen.getAllByRole("button").find((b) => /jake/i.test(b.textContent ?? ""));
      expect(jakeBtn).toBeDefined();
      await userEvent.click(jakeBtn!);
      await userEvent.click(screen.getByRole("button", { name: /save/i }));
      expect(onSave).toHaveBeenCalledTimes(1);
      const saved: Event = onSave.mock.calls[0]![0];
      expect(saved.startTime).toBe(source.startTime);
      expect(saved.endTime).toBe(source.endTime);
      // Owner did change.
      expect(saved.owner).toEqual({ slot: "parent1" });
    });

    // Seam: future-projected owner edit must route through setOwnerOverride (not saveEvent, which pins time).
    it("seam: drawer + useDrawer routes future-projected owner edit through setOwnerOverride, not saveEvent", async () => {
      const source = futureNap();
      const saveEvent = vi.fn().mockResolvedValue(undefined);
      const setOwnerOverride = vi.fn().mockResolvedValue(undefined);
      const deleteOptimistic = vi.fn().mockResolvedValue(undefined);

      function Harness() {
        const { drawer, openEdit, onSave } = useDrawer({
          saveEvent,
          deleteOptimistic,
          setOwnerOverride,
        });
        useEffect(() => {
          openEdit(source);
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
        if (!drawer.open || drawer.mode !== "edit") return null;
        return (
          <EventEditDrawerV3
            open
            mode="edit"
            event={drawer.event}
            owners={owners}
            nowMinutes={NOW}
            bedtimeThreshold={THRESHOLD}
            defaultWakeTime={DEFAULT_WAKE_TIME}
            onSave={onSave}
            onCancel={() => {}}
          />
        );
      }

      render(<Harness />);
      // Flush the openEdit effect.
      await screen.findByRole("dialog");
      const jakeBtn = screen.getAllByRole("button").find((b) => /jake/i.test(b.textContent ?? ""));
      await userEvent.click(jakeBtn!);
      await userEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(setOwnerOverride).toHaveBeenCalledTimes(1);
      expect(setOwnerOverride).toHaveBeenCalledWith(source.eventKey, { slot: "parent1" });
      expect(saveEvent).not.toHaveBeenCalled();
    });
  });
});

describe("Pump volume", () => {
  function renderPump(event: Event, onSave = vi.fn()) {
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={event}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    return onSave;
  }

  it("shows a Volumes section with Left and Right inputs defaulting to 0", () => {
    renderPump(projectedPump());
    expect(screen.getByText("Volumes")).toBeVisible();
    expect(screen.getByLabelText("Left")).toHaveValue(0);
    expect(screen.getByLabelText("Right")).toHaveValue(0);
  });

  it("populates the inputs from an existing recorded volume", () => {
    renderPump(projectedPump({ pumpVolumeOz: { left: 2.5, right: 3.25 } }));
    expect(screen.getByLabelText("Left")).toHaveValue(2.5);
    expect(screen.getByLabelText("Right")).toHaveValue(3.25);
  });

  it("saves entered volumes as pumpVolumeOz", async () => {
    const onSave = renderPump(projectedPump());
    const left = screen.getByLabelText("Left");
    const right = screen.getByLabelText("Right");
    await userEvent.clear(left);
    await userEvent.type(left, "2.5");
    await userEvent.clear(right);
    await userEvent.type(right, "3");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0].pumpVolumeOz).toEqual({ left: 2.5, right: 3 });
  });

  it("does not show a Volumes section for a bottle", () => {
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedBottle()}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByText("Volumes")).toBeNull();
  });
});

describe("Drawer now-shortcut buttons", () => {
  const NAP_MIN = 20;

  function renderNapDrawer(event: Event, siblings: Event[], now: TimeMin) {
    return render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={event}
        owners={owners}
        nowMinutes={now}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        napDurationMin={NAP_MIN}
        existingEvents={siblings}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
  }

  const hm = (min: number) =>
    `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

  describe("Start now (nap, preserves duration)", () => {
    it("fills startTime with Now and shifts endTime to keep the existing duration", async () => {
      const now = 8 * 60 + 30;
      const nap = projectedNap({ startTime: 9 * 60, endTime: 10 * 60 }); // next-upcoming, 60-min
      renderNapDrawer(nap, [nap], now);

      await userEvent.click(screen.getByRole("button", { name: "Start now" }));

      expect(screen.getByLabelText("Start time")).toHaveValue(hm(now));
      expect(screen.getByLabelText("End time")).toHaveValue(hm(now + 60));
    });

    it("is hidden on a past nap (manual edit only)", () => {
      const now = 14 * 60;
      const past = projectedNap({ startTime: 9 * 60, endTime: 10 * 60 });
      renderNapDrawer(past, [past], now);

      expect(screen.queryByRole("button", { name: "Start now" })).toBeNull();
    });
  });

  describe("End now (nap)", () => {
    it("fills endTime with Now when the nap is long enough (no confirm)", async () => {
      const now = 9 * 60 + 30; // 30 min in, > NAP_MIN
      const inProgress = projectedNap({ startTime: 9 * 60, endTime: 10 * 60 });
      renderNapDrawer(inProgress, [inProgress], now);

      await userEvent.click(screen.getByRole("button", { name: "End now" }));

      expect(screen.getByLabelText("End time")).toHaveValue(hm(now));
    });

    it("is hidden on the next-upcoming nap that hasn't started", () => {
      const now = 8 * 60 + 30;
      const upcoming = projectedNap({ startTime: 9 * 60, endTime: 10 * 60 });
      renderNapDrawer(upcoming, [upcoming], now);

      expect(screen.queryByRole("button", { name: "End now" })).toBeNull();
      expect(screen.getByRole("button", { name: "Start now" })).toBeVisible();
    });

    it("prompts before ending a nap shorter than the minimum, and fills only on confirm", async () => {
      const now = 9 * 60 + 10; // 10 min in, < NAP_MIN (20)
      const inProgress = projectedNap({ startTime: 9 * 60, endTime: 10 * 60 });
      renderNapDrawer(inProgress, [inProgress], now);

      await userEvent.click(screen.getByRole("button", { name: "End now" }));

      expect(
        screen.getByText(/shorter than your minimum nap setting of 20 minutes/i),
      ).toBeVisible();
      expect(screen.getByLabelText("End time")).toHaveValue("10:00"); // unchanged until confirm

      await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
      expect(screen.getByLabelText("End time")).toHaveValue(hm(now));
    });

    it("leaves endTime unchanged when the short-nap prompt is cancelled", async () => {
      const now = 9 * 60 + 10;
      const inProgress = projectedNap({ startTime: 9 * 60, endTime: 10 * 60 });
      renderNapDrawer(inProgress, [inProgress], now);

      await userEvent.click(screen.getByRole("button", { name: "End now" }));
      const dialog = screen.getByRole("dialog", { name: "Are you sure?" });
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(screen.getByLabelText("End time")).toHaveValue("10:00");
    });
  });

  describe("Log now (bottle)", () => {
    it("fills the bottle startTime with Now, leaving amount untouched", async () => {
      const now = 8 * 60 + 30;
      const bottle = projectedBottle({ startTime: 7 * 60 + 30, amountOz: 4 });
      render(
        <EventEditDrawerV3
          open
          mode="edit"
          event={bottle}
          owners={owners}
          nowMinutes={now}
          bedtimeThreshold={THRESHOLD}
          defaultWakeTime={DEFAULT_WAKE_TIME}
          existingEvents={[bottle]}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "Log now" }));

      expect(screen.getByLabelText("Start time")).toHaveValue(hm(now));
      expect(screen.getByLabelText("Amount (oz)")).toHaveValue(4);
    });

    it("shows Log now on a dream feed", async () => {
      const now = 23 * 60;
      const dreamFeed = projectedBottle({
        id: "proj_bottle_dream",
        eventKey: "bottle_dream",
        startTime: 23 * 60,
        label: "Dream Feed",
      });
      render(
        <EventEditDrawerV3
          open
          mode="edit"
          event={dreamFeed}
          owners={owners}
          nowMinutes={now}
          bedtimeThreshold={THRESHOLD}
          defaultWakeTime={DEFAULT_WAKE_TIME}
          existingEvents={[dreamFeed]}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByRole("button", { name: "Log now" })).toBeVisible();
    });
  });

  describe("Log now (bedtime)", () => {
    const projectedBedtime = (overrides: Partial<Event> = {}): Event => ({
      id: "bedtime-1",
      dayId: "d-1",
      eventKey: "bedtime",
      type: "bedtime",
      kind: "block",
      startTime: 19 * 60,
      endTime: DEFAULT_WAKE_TIME + 24 * 60, // default wake next day (cross-day TimeMin)
      label: "Bedtime",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
      ...overrides,
    });

    it("shows Log now and offers no wake/end-time field", () => {
      const bedtime = projectedBedtime();
      render(
        <EventEditDrawerV3
          open
          mode="edit"
          event={bedtime}
          owners={owners}
          nowMinutes={20 * 60}
          bedtimeThreshold={THRESHOLD}
          defaultWakeTime={DEFAULT_WAKE_TIME}
          existingEvents={[bedtime]}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByRole("button", { name: "Log now" })).toBeVisible();
      expect(screen.queryByLabelText("End time")).toBeNull();
    });

    it("pins bedtime startTime to Now on Save, leaving the default wake (endTime) untouched", async () => {
      const now = 20 * 60 + 30; // 8:30 PM
      const onSave = vi.fn();
      const bedtime = projectedBedtime();
      render(
        <EventEditDrawerV3
          open
          mode="edit"
          event={bedtime}
          owners={owners}
          nowMinutes={now}
          bedtimeThreshold={THRESHOLD}
          defaultWakeTime={DEFAULT_WAKE_TIME}
          existingEvents={[bedtime]}
          onSave={onSave}
          onCancel={vi.fn()}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "Log now" }));
      expect(screen.getByLabelText("Start time")).toHaveValue(hm(now));

      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onSave).toHaveBeenCalledTimes(1);
      const next: Event = onSave.mock.calls[0]![0];
      expect(next.startTime).toBe(now);
      expect(next.endTime).toBe(DEFAULT_WAKE_TIME + 24 * 60); // unchanged
      expect(next.lifecycle.state).not.toBe("projected");
    });
  });
});
