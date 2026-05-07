import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NowBar } from "./NowBar";

describe("<NowBar />", () => {
  it("renders the line spanning from axis edge to right inset", () => {
    render(<NowBar topPx={200} axisWidthPx={50} rightPx={6} nowMinutes={9 * 60 + 18} />);
    const line = screen.getByTestId("now-line");
    expect(line).toHaveStyle({ left: "50px", right: "6px", top: "200px" });
  });

  it("constrains the pill to the axis lane width", () => {
    render(<NowBar topPx={200} axisWidthPx={50} nowMinutes={9 * 60 + 3} />);
    const pill = screen.getByTestId("now-pill");
    // Width should be axisWidthPx - 2 = 48px so it stops short of the line.
    expect(pill).toHaveStyle({ width: "48px", left: "0px" });
  });

  it("formats the time label", () => {
    render(<NowBar topPx={0} axisWidthPx={50} nowMinutes={13 * 60 + 5} />);
    expect(screen.getByTestId("now-pill")).toHaveTextContent(/1:05 PM/);
  });

  it("does NOT extend the pill into the block lane (anti-requirement)", () => {
    render(<NowBar topPx={0} axisWidthPx={50} nowMinutes={9 * 60} />);
    const pill = screen.getByTestId("now-pill");
    const widthValue = (pill as HTMLElement).style.width;
    const leftValue = (pill as HTMLElement).style.left;
    expect(parseInt(leftValue, 10) + parseInt(widthValue, 10)).toBeLessThanOrEqual(50);
  });
});
