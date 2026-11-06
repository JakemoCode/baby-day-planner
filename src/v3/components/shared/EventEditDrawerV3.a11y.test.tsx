import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "@/test-utils";
import type { Event, OwnersConfig } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { EventEditDrawerV3 } from "./EventEditDrawerV3";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [],
};

const napEvent: Event = {
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
};

const pumpEvent: Event = {
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
};

const bottleEvent: Event = {
  id: "bottle-1",
  dayId: "d-1",
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  startTime: 8 * 60,
  label: "Bottle 1",
  hasPutdown: false,
  owner: NO_OWNER,
  amountOz: 4,
  lifecycle: { state: "projected" },
};

describe("EventEditDrawerV3 a11y", () => {
  it("open bottle drawer (amount stepper) has no structural a11y violations", async () => {
    const { container } = render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={bottleEvent}
        owners={owners}
        nowMinutes={8 * 60 + 30}
        bedtimeThreshold={19 * 60}
        defaultWakeTime={7 * 60}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("open nap drawer has no structural a11y violations", async () => {
    const { container } = render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={napEvent}
        owners={owners}
        nowMinutes={8 * 60 + 30}
        bedtimeThreshold={19 * 60}
        defaultWakeTime={7 * 60}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("open pump drawer (paired times + Volumes section) has no structural a11y violations", async () => {
    const { container } = render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={pumpEvent}
        owners={owners}
        nowMinutes={8 * 60 + 30}
        bedtimeThreshold={19 * 60}
        defaultWakeTime={7 * 60}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
