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

  it("§F56: drawer heading for a recurring event includes the event label", () => {
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

  it("§F66 fast-follow B7: flags startTime < dayWakeTime as a pre-wake error (AM/PM safeguard)", async () => {
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

  it("§F66 audit: B7 pre-wake guard does NOT flag startTime === dayWakeTime (boundary)", async () => {
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

  it("§F66 review: B7 pre-wake guard does NOT block a pre-wake daily_recurring (review-found false positive)", async () => {
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

  it("§F66 fast-follow B1: does not flag overlap against a render-synthetic putdown chip", async () => {
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

  it("delete button is shown for already-recorded events", () => {
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedNap({ lifecycle: { state: "completed", committedAt: 10 * 60 } })}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={THRESHOLD}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("§F66 B11: delete button is HIDDEN for an auto-promoted bottle (recorded + annotatedAt===startTime)", () => {
    // Auto-promote signature: recorded + annotatedAt===startTime. Manual logs use completed; drawer saves bump annotatedAt.
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedBottle({
          id: "recorded_bottle_2",
          startTime: 10 * 60,
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
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("§F66 audit B11: delete button is SHOWN for a recorded bottle when annotatedAt !== startTime", () => {
    // Dropping `annotatedAt===startTime` from the auto-promote check would hide Delete on all recorded bottles.
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedBottle({
          id: "recorded_bottle_2",
          startTime: 10 * 60,
          // Drawer re-save at 11:00 bumped annotatedAt away from startTime.
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
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
  });

  it("§F66 B11: delete button is SHOWN for a manually-logged bottle (lifecycle completed)", () => {
    // buildLoggedBottle writes lifecycle completed; user must be able to delete it.
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedBottle({
          id: "recorded_bottle_5",
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

  it("§F66 B11: delete button is HIDDEN for an auto-promoted nap (proj_ id + recorded lifecycle)", () => {
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

  it("§F65: delete button is shown for a PROJECTED daily_recurring event", () => {
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

  it("§F65: delete confirmation for a daily_recurring uses skip-today copy", async () => {
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

  describe("§F66 future-event drawer rule (ADR-0001)", () => {
    const futureNap = () =>
      projectedNap({
        id: "nap-future",
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

    it("§F66 fast-follow C2: chronologically-NEXT projected nap is editable (sick-day flex)", () => {
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

    it("§F66 fast-follow C2: farther-out projected nap stays locked (cascade re-projects from the pin)", () => {
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
        const { drawer, openEdit, onSave } = useDrawer(
          [], // empty actuals → source is projected
          saveEvent,
          deleteOptimistic,
          setOwnerOverride,
        );
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
