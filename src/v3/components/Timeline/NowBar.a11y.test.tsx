import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { NowBar } from "./NowBar";
import { axe } from "@/test-utils";
import { expect } from "vitest";

describe("NowBar a11y", () => {
  it("has no structural a11y violations", async () => {
    const { container } = render(
      <NowBar topPx={150} axisWidthPx={48} rightPx={4} nowMinutes={9 * 60 + 30} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
