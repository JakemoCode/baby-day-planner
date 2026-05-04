import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "@/app/page";

describe("Home page", () => {
  it("renders the app title", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /baby day planner/i })).toBeInTheDocument();
  });

  it("renders the bootstrap status line", () => {
    render(<Home />);
    expect(screen.getByText(/bootstrap is alive/i)).toBeInTheDocument();
  });
});
