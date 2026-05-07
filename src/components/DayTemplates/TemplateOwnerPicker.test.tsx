import { describe, it, expect, vi } from "vitest";
import type { Event } from "@/domain";
import { render, screen, userEvent } from "@/test-utils";
import { TemplateOwnerPicker } from "./TemplateOwnerPicker";

const napEvent: Event = {
  id: "nap-1",
  dayId: "day-1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  recorded: false,
  label: "Nap 1",
  startTime: "09:00",
  endTime: "10:00",
  source: "projected",
  status: "projected",
};

describe("TemplateOwnerPicker", () => {
  it("renders the event label and time range", () => {
    render(<TemplateOwnerPicker event={napEvent} onSelect={() => {}} onCancel={() => {}} />);
    expect(screen.getByText("Nap 1")).toBeVisible();
    expect(screen.getByText("9:00 AM–10:00 AM")).toBeVisible();
  });

  it("invokes onSelect with the chosen owner", async () => {
    const onSelect = vi.fn();
    render(<TemplateOwnerPicker event={napEvent} onSelect={onSelect} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Kelly" }));
    expect(onSelect).toHaveBeenCalledWith("Kelly");
  });

  it("invokes onCancel when the close button is tapped", async () => {
    const onCancel = vi.fn();
    render(<TemplateOwnerPicker event={napEvent} onSelect={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel owner assignment/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("marks the current owner as pressed", () => {
    const owned: Event = { ...napEvent, owner: "Jake" };
    render(<TemplateOwnerPicker event={owned} onSelect={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: "Jake", pressed: true })).toBeVisible();
    expect(screen.getByRole("button", { name: "Kelly", pressed: false })).toBeVisible();
  });

  it("shows a single-time label for events without an end", () => {
    const { endTime: _omit, ...rest } = napEvent;
    const point: Event = { ...rest, type: "bottle", label: "Bottle 2" };
    render(<TemplateOwnerPicker event={point} onSelect={() => {}} onCancel={() => {}} />);
    expect(screen.getByText("9:00 AM")).toBeVisible();
  });
});
