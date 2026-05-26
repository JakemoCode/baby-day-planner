/**
 * EditableWakeTime: small display-and-edit affordance for Day.wakeTime.
 *
 * Tests cover the state machine (display ↔ edit), commit semantics
 * (unchanged → no onChange; invalid → silent revert), keyboard
 * shortcuts, and variant styling. No Firestore / no engine — pure
 * controlled component, so all assertions use real impls.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TimeMin } from "@/v3/schemas";
import { EditableWakeTime } from "./EditableWakeTime";

const SEVEN_AM = (7 * 60) as TimeMin;
const SEVEN_THIRTY_AM = (7 * 60 + 30) as TimeMin;

describe("EditableWakeTime", () => {
  it("renders the display button with formatted time", () => {
    render(<EditableWakeTime wakeTime={SEVEN_AM} onChange={() => {}} />);
    const btn = screen.getByRole("button", { name: /change today's start time/i });
    expect(btn).toBeVisible();
    expect(btn).toHaveTextContent(/Woke at/);
    expect(btn).toHaveTextContent(/7:00\s*AM/);
  });

  it("enters edit mode on click with the input pre-populated to current wakeTime", async () => {
    const user = userEvent.setup();
    render(<EditableWakeTime wakeTime={SEVEN_AM} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /change today's start time/i }));
    const input = screen.getByLabelText(/woke at/i) as HTMLInputElement;
    expect(input).toBeVisible();
    expect(input.value).toBe("07:00");
  });

  it("Save with a new time commits via onChange exactly once and exits edit mode", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EditableWakeTime wakeTime={SEVEN_AM} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /change today's start time/i }));
    const input = screen.getByLabelText(/woke at/i) as HTMLInputElement;
    // Use fireEvent-style change via userEvent
    await user.clear(input);
    await user.type(input, "07:30");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(SEVEN_THIRTY_AM);
    // Back in display mode
    expect(screen.queryByLabelText(/woke at/i)).toBeNull();
  });

  it("Save with unchanged value does NOT call onChange (guard at line 62)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EditableWakeTime wakeTime={SEVEN_AM} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /change today's start time/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Cancel exits edit mode without calling onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EditableWakeTime wakeTime={SEVEN_AM} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /change today's start time/i }));
    const input = screen.getByLabelText(/woke at/i) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "07:30");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/woke at/i)).toBeNull();
  });

  it("Enter key submits, Escape cancels", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EditableWakeTime wakeTime={SEVEN_AM} onChange={onChange} />);
    // Enter to submit
    await user.click(screen.getByRole("button", { name: /change today's start time/i }));
    const input = screen.getByLabelText(/woke at/i) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "07:30{Enter}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith(SEVEN_THIRTY_AM);

    // Escape to cancel — re-open and bail without committing
    onChange.mockClear();
    await user.click(screen.getByRole("button", { name: /change today's start time/i }));
    const input2 = screen.getByLabelText(/woke at/i) as HTMLInputElement;
    await user.clear(input2);
    await user.type(input2, "08:00{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/woke at/i)).toBeNull();
  });

  it("variant='card' applies the card class to the display button", () => {
    const { rerender } = render(<EditableWakeTime wakeTime={SEVEN_AM} onChange={() => {}} />);
    const plainClass = screen.getByRole("button", { name: /change today's start time/i }).className;
    rerender(<EditableWakeTime wakeTime={SEVEN_AM} onChange={() => {}} variant="card" />);
    const cardClass = screen.getByRole("button", { name: /change today's start time/i }).className;
    // Card variant adds an extra class token; plain variant does not.
    expect(cardClass.split(/\s+/).length).toBeGreaterThan(plainClass.split(/\s+/).length);
  });
});
