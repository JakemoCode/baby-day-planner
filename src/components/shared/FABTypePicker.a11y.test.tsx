import { describe, it } from "vitest";
import { render } from "@/test-utils";
import { axe } from "@/test-utils";
import { expect } from "vitest";
import { FABTypePicker } from "./FABTypePicker";

describe("FABTypePicker a11y", () => {
  it("has no structural a11y violations when open", async () => {
    const { container } = render(<FABTypePicker open onSelect={() => {}} onCancel={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
