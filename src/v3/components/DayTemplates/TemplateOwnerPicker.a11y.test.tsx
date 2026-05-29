import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "@/test-utils";
import { NO_OWNER, type Event, type OwnersConfig, type OwnershipTemplate } from "../../schemas";
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
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
};

const template: OwnershipTemplate = {
  id: "tpl-1",
  displayName: "Weekday",
  napOwners: [{ slot: "parent1" }],
  wakeWindowOwners: [],
};

describe("TemplateOwnerPicker a11y", () => {
  it("has no axe violations when rendering with title and owner buttons", async () => {
    const { container } = render(
      <TemplateOwnerPicker
        event={napEvent}
        template={template}
        owners={owners}
        title="Owner for Nap 1"
        onCancel={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
