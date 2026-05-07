import { describe, it, expect, vi } from "vitest";
import type { Event } from "@/domain";
import { renderWithAuth, screen, userEvent, within } from "@/test-utils";
import { EventEditDrawer } from "./EventEditDrawer";

const baseEvent = (overrides: Partial<Event>): Event => ({
  id: "ev-1",
  dayId: "day-1",
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  recorded: false,
  label: "Bottle 1",
  startTime: "07:05",
  amountOz: 5,
  source: "actual",
  status: "actual",
  ...overrides,
});

describe("EventEditDrawer", () => {
  it("renders nothing when open is false", () => {
    renderWithAuth(
      <EventEditDrawer
        open={false}
        event={baseEvent({})}
        mode="edit"
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders bottle form with start time, amount, and owner fields", () => {
    renderWithAuth(
      <EventEditDrawer
        open
        event={baseEvent({ type: "bottle" })}
        mode="edit"
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByLabelText(/start time/i)).toBeVisible();
    expect(screen.getByLabelText(/amount/i)).toBeVisible();
    expect(screen.getByRole("group", { name: /owner/i })).toBeVisible();
  });

  it("renders nap form with start time, end time, and owner fields", () => {
    renderWithAuth(
      <EventEditDrawer
        open
        event={baseEvent({
          type: "nap",
          kind: "block",
          recorded: false,
          eventKey: "nap_1",
          label: "Nap 1",
          endTime: "10:00",
        })}
        mode="edit"
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByLabelText(/start time/i)).toBeVisible();
    expect(screen.getByLabelText(/end time/i)).toBeVisible();
    expect(screen.getByRole("group", { name: /owner/i })).toBeVisible();
  });

  it("renders wake_window form with only owner field", () => {
    renderWithAuth(
      <EventEditDrawer
        open
        event={baseEvent({
          type: "wake_window",
          kind: "block",
          recorded: false,
          eventKey: "wake_window_1",
          label: "Wake Window 1",
          endTime: "09:00",
        })}
        mode="edit"
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("group", { name: /owner/i })).toBeVisible();
    expect(screen.queryByLabelText(/start time/i)).toBeNull();
    expect(screen.queryByLabelText(/end time/i)).toBeNull();
  });

  it("renders extra form with label, start, optional end, and owner", () => {
    renderWithAuth(
      <EventEditDrawer
        open
        event={baseEvent({
          type: "extra",
          kind: "instant",
          recorded: false,
          eventKey: "extra_1",
          label: "Pediatrician",
          startTime: "11:00",
          source: "manual",
        })}
        mode="edit"
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByLabelText(/label/i)).toBeVisible();
    expect(screen.getByLabelText(/start time/i)).toBeVisible();
    expect(screen.getByLabelText(/end time/i)).toBeVisible();
  });

  it("calls onSave with updated values when Save is clicked", async () => {
    const onSave = vi.fn();
    renderWithAuth(
      <EventEditDrawer
        open
        event={baseEvent({ type: "bottle" })}
        mode="edit"
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ id: "ev-1", type: "bottle" });
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    renderWithAuth(
      <EventEditDrawer
        open
        event={baseEvent({})}
        mode="edit"
        onSave={() => {}}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on Escape", async () => {
    const onCancel = vi.fn();
    renderWithAuth(
      <EventEditDrawer
        open
        event={baseEvent({})}
        mode="edit"
        onSave={() => {}}
        onCancel={onCancel}
      />,
    );
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows Delete button only for actual/manual events with onDelete handler", () => {
    const onDelete = vi.fn();
    renderWithAuth(
      <EventEditDrawer
        open
        event={baseEvent({ source: "actual" })}
        mode="edit"
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByRole("button", { name: /delete/i })).toBeVisible();
  });

  it("hides Delete for projected events", () => {
    renderWithAuth(
      <EventEditDrawer
        open
        event={baseEvent({ source: "projected", status: "projected" })}
        mode="edit"
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^delete$/i })).toBeNull();
  });

  it("Delete button shows confirmation dialog, then calls onDelete", async () => {
    const onDelete = vi.fn();
    renderWithAuth(
      <EventEditDrawer
        open
        event={baseEvent({ source: "actual" })}
        mode="edit"
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={onDelete}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    // Confirm dialog appears
    const confirmDialog = screen.getByRole("dialog", { name: /delete this/i });
    expect(confirmDialog).toBeVisible();
    await userEvent.click(within(confirmDialog).getByRole("button", { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("create mode renders the seeded template's form fields", () => {
    const template: Event = baseEvent({
      id: "extra-new",
      eventKey: "extra_new",
      type: "extra",
      kind: "instant",
      recorded: false,
      label: "",
      startTime: "12:00",
      source: "manual",
      status: "completed",
    });
    delete (template as Partial<Event>).amountOz;
    renderWithAuth(
      <EventEditDrawer open event={template} mode="create" onSave={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByLabelText(/label/i)).toBeVisible();
    expect(screen.getByLabelText(/start time/i)).toBeVisible();
  });
});
