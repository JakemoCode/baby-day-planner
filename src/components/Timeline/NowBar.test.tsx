import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NowBar } from "./NowBar";

describe("<NowBar />", () => {
  it("renders the line spanning from axis edge to right inset", () => {
    render(<NowBar topPx={200} axisWidthPx={50} rightPx={6} nowMinutes={9 * 60 + 18} />);
    const line = screen.getByTestId("now-line");
    expect(line).toHaveStyle({ left: "50px", right: "6px", top: "200px" });
  });

  it("anchors the pill at the left edge", () => {
    render(<NowBar topPx={200} axisWidthPx={36} nowMinutes={9 * 60 + 3} />);
    const pill = screen.getByTestId("now-pill");
    expect(pill).toHaveStyle({ left: "0px" });
  });

  it("formats the time label in full AM/PM form", () => {
    render(<NowBar topPx={0} axisWidthPx={36} nowMinutes={13 * 60 + 5} />);
    expect(screen.getByTestId("now-pill")).toHaveTextContent(/1:05 PM/);
    render(<NowBar topPx={0} axisWidthPx={36} nowMinutes={11 * 60 + 1} />);
    expect(screen.getAllByTestId("now-pill")[1]).toHaveTextContent(/11:01 AM/);
  });
});
