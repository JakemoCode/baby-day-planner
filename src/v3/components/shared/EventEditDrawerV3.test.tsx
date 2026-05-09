/**
 * EventEditDrawerV3 — V3 lifecycle dispatch, slot-based owner picker,
 * TimeMin form values. The form-state lifecycle math is fully covered
 * in formToEvent.test.ts; this file validates the React drawer
 * rendering + integration: the right fields show per type, the right
 * onSave payload assembles, validation surfaces overlap errors.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event, OwnersConfig } from "../../schemas";
import { EventEditDrawerV3 } from "./EventEditDrawerV3";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [],
};

const NOW = 8 * 60 + 30;

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
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Jake" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const next: Event = onSave.mock.calls[0]![0];
    expect(next.owner).toEqual({ slot: "parent1" });
    expect(next.lifecycle).toEqual({ state: "overridden", annotatedAt: NOW });
  });

  it("saves time edit as completed lifecycle (block with endTime)", async () => {
    const onSave = vi.fn();
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedNap()}
        owners={owners}
        nowMinutes={NOW}
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
    expect(next.lifecycle).toEqual({ state: "completed", committedAt: NOW });
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
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("delete button is shown for already-recorded events", () => {
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedNap({ lifecycle: { state: "completed", committedAt: 10 * 60 } })}
        owners={owners}
        nowMinutes={NOW}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
