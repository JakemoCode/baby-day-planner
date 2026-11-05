import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkippedNaps } from "./SkippedNaps";

describe("SkippedNaps (R3.11 undo)", () => {
  it("renders nothing when no nap is skipped", () => {
    const { container } = render(<SkippedNaps napKeys={[]} onRestore={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each skipped nap in slot order with its own Restore button", () => {
    render(<SkippedNaps napKeys={["nap_3", "nap_2"]} onRestore={() => {}} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Restore Nap 2",
      "Restore Nap 3",
    ]);
    expect(screen.getByText("Skipped today")).toBeVisible();
  });

  it("orders nap_10 after nap_9", () => {
    render(<SkippedNaps napKeys={["nap_10", "nap_9"]} onRestore={() => {}} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Restore Nap 9",
      "Restore Nap 10",
    ]);
  });

  it("Restore hands back the slot key", async () => {
    const onRestore = vi.fn();
    render(<SkippedNaps napKeys={["nap_2"]} onRestore={onRestore} />);
    await userEvent.click(screen.getByRole("button", { name: "Restore Nap 2" }));
    expect(onRestore).toHaveBeenCalledWith("nap_2");
  });
});
