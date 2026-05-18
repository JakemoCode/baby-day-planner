/**
 * V3 TemplateOwnerPicker — slot-based owner picker for an event in a
 * template. Differences from V2:
 *   - Reads the current owner from the template (not event.owner string).
 *   - Renders OwnerPickerV3 (slot-based, derived from settings.owners).
 *   - onSelect emits OwnerRef | undefined; "None" clears the slot.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test-utils";
import type { Event, OwnersConfig, OwnershipTemplate } from "../../schemas";
import { TemplateOwnerPicker } from "./TemplateOwnerPicker";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [{ id: "daycare", displayName: "Daycare", color: "#ccc" }],
};

const napEvent: Event = {
  id: "nap-1",
  dayId: "day-1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  startTime: 9 * 60,
  endTime: 10 * 60,
  label: "Nap 1",
  hasPutdown: false,
  lifecycle: { state: "projected" },
};

const wakeWindowEvent: Event = {
  id: "ww-1",
  dayId: "day-1",
  eventKey: "wake_window_1",
  type: "wake_window",
  kind: "block",
  startTime: 8 * 60,
  endTime: 9 * 60,
  label: "Wake window 1",
  hasPutdown: false,
  lifecycle: { state: "projected" },
};

const bottleEvent: Event = {
  id: "bottle-2",
  dayId: "day-1",
  eventKey: "bottle_2",
  type: "bottle",
  kind: "instant",
  startTime: 11 * 60,
  label: "Bottle 2",
  hasPutdown: false,
  lifecycle: { state: "projected" },
};

const bedtimeEvent: Event = {
  id: "bedtime",
  dayId: "day-1",
  eventKey: "bedtime",
  type: "bedtime",
  kind: "block",
  startTime: 19 * 60,
  endTime: 19 * 60 + 30,
  label: "Bedtime",
  hasPutdown: false,
  lifecycle: { state: "projected" },
};

function makeTemplate(over: Partial<OwnershipTemplate> = {}): OwnershipTemplate {
  return {
    id: "tpl-1",
    displayName: "Weekday",
    napOwners: [],
    wakeWindowOwners: [],
    ...over,
  };
}

describe("TemplateOwnerPicker (V3)", () => {
  it("marks the current template owner for the event as pressed", () => {
    const template = makeTemplate({ napOwners: [{ slot: "parent2" }] });
    render(
      <TemplateOwnerPicker
        event={napEvent}
        template={template}
        owners={owners}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Sam" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Jake" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows None as pressed when the template has no owner for the event", () => {
    const template = makeTemplate(); // empty napOwners
    render(
      <TemplateOwnerPicker
        event={napEvent}
        template={template}
        owners={owners}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "true");
  });

  it("invokes onSelect with the new OwnerRef when a different owner is picked", async () => {
    const onSelect = vi.fn();
    const template = makeTemplate({ napOwners: [{ slot: "parent1" }] });
    render(
      <TemplateOwnerPicker
        event={napEvent}
        template={template}
        owners={owners}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Sam" }));
    expect(onSelect).toHaveBeenCalledWith({ slot: "parent2" });
  });

  it("invokes onSelect with undefined when None is picked", async () => {
    const onSelect = vi.fn();
    const template = makeTemplate({ napOwners: [{ slot: "parent1" }] });
    render(
      <TemplateOwnerPicker
        event={napEvent}
        template={template}
        owners={owners}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "None" }));
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it("reads wake_window owner from template.wakeWindowOwners by index", () => {
    const template = makeTemplate({
      wakeWindowOwners: [{ slot: "parent2" }],
    });
    render(
      <TemplateOwnerPicker
        event={wakeWindowEvent}
        template={template}
        owners={owners}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Sam" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Jake" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reads bottle owner from template.bottleOwners by index", () => {
    const template = makeTemplate({
      bottleOwners: [{ slot: "parent1" }, { slot: "other", otherId: "daycare" }],
    });
    render(
      <TemplateOwnerPicker
        event={bottleEvent}
        template={template}
        owners={owners}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Daycare" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reads bedtime owner from template.bedtimeOwner", () => {
    const template = makeTemplate({ bedtimeOwner: { slot: "parent1" } });
    render(
      <TemplateOwnerPicker
        event={bedtimeEvent}
        template={template}
        owners={owners}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Jake" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows None as pressed when bedtimeOwner is unset", () => {
    const template = makeTemplate(); // no bedtimeOwner
    render(
      <TemplateOwnerPicker
        event={bedtimeEvent}
        template={template}
        owners={owners}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders title + Cancel chrome when both props passed, and Cancel invokes the handler", async () => {
    const onCancel = vi.fn();
    const template = makeTemplate({ napOwners: [{ slot: "parent2" }] });
    render(
      <TemplateOwnerPicker
        event={napEvent}
        template={template}
        owners={owners}
        title="Owner for Nap 1"
        onCancel={onCancel}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("Owner for Nap 1")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
