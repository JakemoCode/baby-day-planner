import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { TimeMin } from "@/v3/schemas";
import { axe } from "@/test-utils";
import { WakeConfirmSheet } from "./WakeConfirmSheet";

const NOW = (6 * 60 + 42) as TimeMin;

describe("WakeConfirmSheet a11y", () => {
  it("has no axe violations when rendered open", async () => {
    const { container } = render(
      <WakeConfirmSheet nowMinutes={NOW} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
