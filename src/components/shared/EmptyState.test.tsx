import { describe, it, expect } from "vitest";
import { renderWithAuth, screen } from "@/test-utils";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders the title", () => {
    renderWithAuth(<EmptyState title="No bottles yet" />);
    expect(screen.getByText("No bottles yet")).toBeVisible();
  });

  it("renders an optional body", () => {
    renderWithAuth(<EmptyState title="Day's done" body="Have a good night" />);
    expect(screen.getByText("Have a good night")).toBeVisible();
  });

  it("renders only the title when no body", () => {
    renderWithAuth(<EmptyState title="No history yet" />);
    expect(screen.queryByText(/.+/, { selector: "p" })).toBeNull();
  });
});
