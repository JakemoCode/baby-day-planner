import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DurationInput } from "./DurationInput";
import { formatMinutesAsHHMM, parseHHMMToMinutes } from "./duration";

describe("formatMinutesAsHHMM", () => {
  it("formats whole hours with zero minutes", () => {
    expect(formatMinutesAsHHMM(120)).toBe("2:00");
  });
  it("formats sub-hour as 0:MM", () => {
    expect(formatMinutesAsHHMM(15)).toBe("0:15");
  });
  it("formats mixed hours and minutes", () => {
    expect(formatMinutesAsHHMM(85)).toBe("1:25");
  });
  it("clamps invalid input to 0:00", () => {
    expect(formatMinutesAsHHMM(NaN)).toBe("0:00");
    expect(formatMinutesAsHHMM(-30)).toBe("0:00");
  });
});

describe("parseHHMMToMinutes", () => {
  it("parses h:mm into total minutes", () => {
    expect(parseHHMMToMinutes("1:25")).toBe(85);
    expect(parseHHMMToMinutes("0:45")).toBe(45);
    expect(parseHHMMToMinutes("2:00")).toBe(120);
  });
  it("treats a bare number as minutes", () => {
    expect(parseHHMMToMinutes("85")).toBe(85);
    expect(parseHHMMToMinutes("0")).toBe(0);
  });
  it("rejects invalid forms", () => {
    expect(parseHHMMToMinutes("")).toBe(null);
    expect(parseHHMMToMinutes("abc")).toBe(null);
    expect(parseHHMMToMinutes("1:60")).toBe(null);
    expect(parseHHMMToMinutes("-1:00")).toBe(null);
  });
});

describe("<DurationInput />", () => {
  it("renders the value as h:mm", () => {
    render(<DurationInput value={85} onChange={() => {}} ariaLabel="Test" />);
    const input = screen.getByLabelText("Test") as HTMLInputElement;
    expect(input.value).toBe("1:25");
  });

  it("commits a parsed value on blur", async () => {
    const onChange = vi.fn();
    render(<DurationInput value={60} onChange={onChange} ariaLabel="Test" />);
    const input = screen.getByLabelText("Test");
    await userEvent.clear(input);
    await userEvent.type(input, "1:25");
    await userEvent.tab(); // blur
    expect(onChange).toHaveBeenCalledWith(85);
  });

  it("accepts a bare number as minutes", async () => {
    const onChange = vi.fn();
    render(<DurationInput value={60} onChange={onChange} ariaLabel="Test" />);
    const input = screen.getByLabelText("Test");
    await userEvent.clear(input);
    await userEvent.type(input, "85");
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledWith(85);
  });

  it("reverts to the last good value when the draft is invalid", async () => {
    const onChange = vi.fn();
    render(<DurationInput value={60} onChange={onChange} ariaLabel="Test" />);
    const input = screen.getByLabelText("Test") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "garbage");
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("1:00");
  });

  it("does not fire onChange when the parsed value equals the current value", async () => {
    const onChange = vi.fn();
    render(<DurationInput value={85} onChange={onChange} ariaLabel="Test" />);
    const input = screen.getByLabelText("Test");
    await userEvent.click(input);
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
  });
});
