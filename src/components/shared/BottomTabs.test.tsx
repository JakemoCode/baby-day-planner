import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen } from "@/test-utils";
import { BottomTabs } from "./BottomTabs";

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

describe("BottomTabs", () => {
  it("renders four primary tabs", () => {
    usePathnameMock.mockReturnValue("/");
    renderWithAuth(<BottomTabs />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /timeline/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /tomorrow/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /settings/i })).toBeVisible();
  });

  it("marks Dashboard as current when on /", () => {
    usePathnameMock.mockReturnValue("/");
    renderWithAuth(<BottomTabs />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks Timeline as current when on /timeline", () => {
    usePathnameMock.mockReturnValue("/timeline");
    renderWithAuth(<BottomTabs />);
    expect(screen.getByRole("link", { name: /timeline/i })).toHaveAttribute("aria-current", "page");
  });

  it("marks Tomorrow as current when on /tomorrow", () => {
    usePathnameMock.mockReturnValue("/tomorrow");
    renderWithAuth(<BottomTabs />);
    expect(screen.getByRole("link", { name: /tomorrow/i })).toHaveAttribute("aria-current", "page");
  });

  it("marks Settings as current when on /settings", () => {
    usePathnameMock.mockReturnValue("/settings");
    renderWithAuth(<BottomTabs />);
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("aria-current", "page");
  });

  it("does not mark any tab current when on /history (kebab destination)", () => {
    usePathnameMock.mockReturnValue("/history");
    renderWithAuth(<BottomTabs />);
    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /settings/i })).not.toHaveAttribute("aria-current");
  });
});
