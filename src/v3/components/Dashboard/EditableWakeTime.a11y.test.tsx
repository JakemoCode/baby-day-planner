import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { TimeMin } from "@/v3/schemas";
import { axe } from "@/test-utils";
import { EditableWakeTime } from "./EditableWakeTime";

const SEVEN_AM = (7 * 60) as TimeMin;

describe("EditableWakeTime a11y", () => {
  it("has no axe violations in display mode", async () => {
    const { container } = render(
      <EditableWakeTime wakeTime={SEVEN_AM} onChange={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
