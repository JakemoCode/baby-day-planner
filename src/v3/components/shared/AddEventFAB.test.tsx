import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test-utils";
import { AddEventFAB } from "./AddEventFAB";
import { aSettings } from "../../__tests__/factories";
import type { Event } from "../../schemas";

const baseProps = {
  dayId: "day-1",
  actuals: [] as Event[],
  settings: aSettings(),
  nowMinutes: 12 * 60,
};

describe("AddEventFAB", () => {
  it("opens the type picker when multiple types are offered (default)", async () => {
    const onCreate = vi.fn();
    render(<AddEventFAB {...baseProps} onCreate={onCreate} />);

    // Picker not shown until the FAB is tapped.
    expect(screen.queryByRole("button", { name: /bottle/i })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /add an event/i }));

    // Picker is shown; no event created until a type is chosen.
    expect(screen.getByRole("button", { name: /bottle/i })).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /custom/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![0].type).toBe("extra");
  });

  it("skips the picker and creates directly when only one type is offered", async () => {
    const onCreate = vi.fn();
    render(<AddEventFAB {...baseProps} types={["extra"]} onCreate={onCreate} />);

    await userEvent.click(screen.getByRole("button", { name: /add an event/i }));

    // No picker bottom-sheet appeared (it isn't rendered at all)…
    expect(screen.queryByRole("dialog")).toBeNull();
    // …and the create form is requested directly with an extra template.
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![0].type).toBe("extra");
  });
});
