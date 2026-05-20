/**
 * EventEditDrawerV3 — V3 lifecycle dispatch, slot-based owner picker,
 * TimeMin form values. The form-state lifecycle math is fully covered
 * in formToEvent.test.ts; this file validates the React drawer
 * rendering + integration: the right fields show per type, the right
 * onSave payload assembles, validation surfaces overlap errors.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event, OwnersConfig, TimeMin } from "../../schemas";
import { NO_OWNER } from "../../schemas";
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
    const start = screen.getByLabelText("Start time");
    await userEvent.clear(start);
    await userEvent.type(start, "09:05");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const next: Event = onSave.mock.calls[0]![0];
    expect(next.startTime).toBe(9 * 60 + 5);
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("blocks save when end time is not after start time", async () => {
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
    // Source nap at 11:30–12:00 — clear of recordedNap (9:30–11:00).
    // Editing end to 10:30 then introduces overlap.
    const source = projectedNap({ startTime: 11 * 60 + 30, endTime: 12 * 60 });
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

  it("does not flag overlap against still-projected events", async () => {
    const projectedOther = projectedNap({ id: "other", startTime: 9 * 60 + 30, label: "Nap 2" });
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedNap()}
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

  // PR-A0.4: re-edits of an already-recorded event must update the
  // existing Firestore doc, not create a duplicate. The timeline page's
  // onSave routes via `actuals.some(a => a.id === drawer.event.id)` —
  // this wrapper mirrors that logic so we can verify the routing
  // contract from the drawer-level test surface.
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
    // Already-recorded source keeps its original annotatedAt — only
    // projected→recorded transitions stamp NOW. The contract under
    // test here is the create-vs-update routing, not the lifecycle math.
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

  // §F9 PORT — drawer per-type form coverage previously asserted in V2.

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
    // Owner picker is the only field — assert via the picker's group role
    // so a stray "Jake"-named button elsewhere can't false-positive.
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

  // PR #196 removed Settings per-day-owner for daycare with the intent that
  // owner is assigned per-event via the timeline drawer like every other
  // event. The drawer's `showOwner` flag silently omitted both daycare
  // types, so dropoff/pickup had no owner UI anywhere.
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
  // Per spec PR #146 R2: a nap whose startTime crosses from below to
  // at/after bedtimeThreshold prompts "Change to bedtime?" before save.
  // Yes → delete original (if recorded) + save bedtime doc. No → save
  // as nap; cascade emits projected bedtime after.

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
        // Per DOMAIN.md §3: bedtime extends to next morning's wake.
        // Source nap's endTime (10:00) is dropped; bedtime endTime
        // = defaultWakeTime + 24h = 7:00 + 1440 = 1860.
        endTime: DEFAULT_WAKE_TIME + 24 * 60,
        // `recorded` lifecycle: the user dragged a projected chip
        // to declare "the projected bedtime is at this time."
        // `recorded` triggers putdown synthesis (putdown.ts:42) AND
        // is treated as manualBedtime by the cascade (!isProjected).
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
    // Escape dismisses the prompt — neither path saves nor deletes.
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
});
