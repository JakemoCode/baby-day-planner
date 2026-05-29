import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "@/test-utils";
import type { Day, OwnersConfig } from "../../schemas";
import { aSettings } from "../../__tests__/factories";
import { TomorrowPreview } from "./TomorrowPreview";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [],
};

const settings = aSettings({ childId: "child-1", owners });

const tomorrowDay: Day = {
  id: "day-tomorrow",
  childId: "child-1",
  date: "2026-05-10",
  status: "planned",
  wakeTime: 7 * 60,
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
};

describe("TomorrowPreview a11y", () => {
  it("has no axe violations when rendering a complete planned day", async () => {
    const { container } = render(
      <TomorrowPreview day={tomorrowDay} settings={settings} owners={owners} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
