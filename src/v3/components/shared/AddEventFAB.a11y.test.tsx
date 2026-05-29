import { describe, it } from "vitest";
import { render } from "@/test-utils";
import { axe } from "@/test-utils";
import { expect } from "vitest";
import { aSettings } from "../../__tests__/factories";
import type { Event } from "../../schemas";
import { AddEventFAB } from "./AddEventFAB";

const baseProps = {
  dayId: "day-1",
  actuals: [] as Event[],
  settings: aSettings(),
  nowMinutes: 12 * 60,
};

describe("AddEventFAB a11y", () => {
  it("has no structural a11y violations in closed state", async () => {
    const { container } = render(
      <AddEventFAB {...baseProps} onCreate={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
