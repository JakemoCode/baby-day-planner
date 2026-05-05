import { describe, it, expect } from "vitest";
import {
  parseTime,
  formatTime,
  formatTimeForDisplay,
  addMinutes,
  diffMinutes,
  clampTime,
} from "./time";

describe("parseTime", () => {
  it("converts HH:MM to minutes from day start", () => {
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("07:30")).toBe(450);
    expect(parseTime("23:59")).toBe(1439);
  });

  it("supports cross-midnight values like 25:30", () => {
    expect(parseTime("25:30")).toBe(1530);
  });

  it("throws on malformed input", () => {
    expect(() => parseTime("7:5")).toThrow();
    expect(() => parseTime("ab:cd")).toThrow();
  });
});

describe("formatTime", () => {
  it("converts minutes back to HH:MM", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(450)).toBe("07:30");
    expect(formatTime(1439)).toBe("23:59");
  });

  it("preserves cross-midnight values as 25:30 form", () => {
    expect(formatTime(1530)).toBe("25:30");
  });

  it("rejects negative minutes", () => {
    expect(() => formatTime(-1)).toThrow();
  });
});

describe("addMinutes / diffMinutes", () => {
  it("adds minutes", () => {
    expect(addMinutes("07:30", 90)).toBe("09:00");
    expect(addMinutes("23:00", 120)).toBe("25:00");
  });

  it("computes signed difference", () => {
    expect(diffMinutes("09:00", "07:30")).toBe(90);
    expect(diffMinutes("07:30", "09:00")).toBe(-90);
  });
});

describe("clampTime", () => {
  it("clamps to [min, max] inclusive", () => {
    expect(clampTime("12:00", "10:00", "14:00")).toBe("12:00");
    expect(clampTime("09:00", "10:00", "14:00")).toBe("10:00");
    expect(clampTime("15:00", "10:00", "14:00")).toBe("14:00");
  });
});

describe("formatTimeForDisplay", () => {
  it("converts 24h HH:MM to 12h with AM/PM", () => {
    expect(formatTimeForDisplay("00:00")).toBe("12:00 AM");
    expect(formatTimeForDisplay("00:30")).toBe("12:30 AM");
    expect(formatTimeForDisplay("07:05")).toBe("7:05 AM");
    expect(formatTimeForDisplay("12:00")).toBe("12:00 PM");
    expect(formatTimeForDisplay("13:45")).toBe("1:45 PM");
    expect(formatTimeForDisplay("23:59")).toBe("11:59 PM");
  });

  it("normalizes cross-midnight values into 12h equivalents", () => {
    // 25:30 == 01:30 next day → "1:30 AM"
    expect(formatTimeForDisplay("25:30")).toBe("1:30 AM");
  });
});
