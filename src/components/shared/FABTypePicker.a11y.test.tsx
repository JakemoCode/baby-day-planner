import { describe, it, expect } from "vitest";
import { render, axe } from "@/test-utils";
import { FABTypePicker } from "./FABTypePicker";

describe("FABTypePicker a11y", () => {
  it("has no structural a11y violations when open", async () => {
    const { container } = render(<FABTypePicker open onSelect={() => {}} onCancel={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
