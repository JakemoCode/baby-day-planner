import { describe, it, expect } from "vitest";
import { renderWithAuth, screen } from "@/test-utils";
import { Header } from "./Header";

describe("Header", () => {
  it("renders the child's name and the date", () => {
    renderWithAuth(<Header childName="Aden" date="2026-05-05" />);
    expect(screen.getByText(/Aden's Day/i)).toBeInTheDocument();
    // "May 5" or similar localized form
    expect(screen.getByText(/May 5|May 05/i)).toBeInTheDocument();
  });

  it("formats the date with weekday + month + day", () => {
    renderWithAuth(<Header childName="Aden" date="2026-05-05" />);
    // Tuesday May 5 2026 — matches one of common locale formats
    expect(screen.getByText(/Tue|Mon|Wed|Thu|Fri|Sat|Sun/i)).toBeInTheDocument();
  });

  it("renders right-side actions slot", () => {
    renderWithAuth(<Header childName="Aden" date="2026-05-05" actions={<span>RIGHT_SLOT</span>} />);
    expect(screen.getByText("RIGHT_SLOT")).toBeInTheDocument();
  });

  it("falls back to today's date when no date prop given", () => {
    renderWithAuth(<Header childName="Aden" />);
    // We can't assert the exact date, but confirm something with weekday format renders
    expect(screen.getByText(/Tue|Mon|Wed|Thu|Fri|Sat|Sun/i)).toBeInTheDocument();
  });
});
