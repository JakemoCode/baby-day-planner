import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TimeMin } from "@/v3/schemas";
import { WakeConfirmSheet } from "./WakeConfirmSheet";

const NOW = (6 * 60 + 42) as TimeMin; // 6:42 AM

describe("WakeConfirmSheet", () => {
  it("opens with the time input pre-filled to nowMinutes", () => {
    render(<WakeConfirmSheet nowMinutes={NOW} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByLabelText(/wake time/i) as HTMLInputElement;
    expect(input.value).toBe("06:42");
  });

  it("emits onConfirm with the parsed time when 'Start day' is clicked", async () => {
    const onConfirm = vi.fn();
    render(<WakeConfirmSheet nowMinutes={NOW} onConfirm={onConfirm} onCancel={vi.fn()} />);
    // User edits the time to 6:30 AM (they were checking phone late).
    const input = screen.getByLabelText(/wake time/i) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "06:30");
    await userEvent.click(screen.getByRole("button", { name: /start day/i }));
    expect(onConfirm).toHaveBeenCalledWith(6 * 60 + 30);
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(<WakeConfirmSheet nowMinutes={NOW} onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("captures nowMinutes fresh on each mount (parent must conditionally mount)", () => {
    // Caller contract: parent renders `{open && <WakeConfirmSheet ... />}`
    // so each open creates a new instance with the current `nowMinutes`.
    // Verify by unmounting + remounting with a different value — the
    // input must reflect the LATEST mount's value, not the first.
    const { unmount } = render(
      <WakeConfirmSheet nowMinutes={(8 * 60) as TimeMin} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect((screen.getByLabelText(/wake time/i) as HTMLInputElement).value).toBe("08:00");
    unmount();

    render(
      <WakeConfirmSheet
        nowMinutes={(6 * 60 + 30) as TimeMin}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((screen.getByLabelText(/wake time/i) as HTMLInputElement).value).toBe("06:30");
  });
});
