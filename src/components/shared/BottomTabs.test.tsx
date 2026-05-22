import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen } from "@/test-utils";
import { BottomTabs } from "./BottomTabs";

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

const draftCountMock = vi.fn(() => 0);
vi.mock("@/v3/hooks/useV3TomorrowDraftCount", () => ({
  useV3TomorrowDraftCount: () => draftCountMock(),
}));

describe("BottomTabs", () => {
  it("renders three primary tabs", () => {
    usePathnameMock.mockReturnValue("/");
    renderWithAuth(<BottomTabs />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /timeline/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /tomorrow/i })).toBeVisible();
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

  it("does not mark any tab current when on /history or /settings", () => {
    usePathnameMock.mockReturnValue("/settings");
    renderWithAuth(<BottomTabs />);
    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
  });

  it("renders Tomorrow draft dot when childId is provided and drafts exist", () => {
    usePathnameMock.mockReturnValue("/");
    draftCountMock.mockReturnValue(1);
    renderWithAuth(<BottomTabs childId="child-1" />);
    expect(screen.getByTestId("tomorrow-draft-dot")).toBeVisible();
  });

  it("does not render the draft dot when count is 0", () => {
    usePathnameMock.mockReturnValue("/");
    draftCountMock.mockReturnValue(0);
    renderWithAuth(<BottomTabs childId="child-1" />);
    expect(screen.queryByTestId("tomorrow-draft-dot")).toBeNull();
  });

  it("does not render the draft dot when childId is omitted", () => {
    usePathnameMock.mockReturnValue("/");
    draftCountMock.mockReturnValue(5);
    renderWithAuth(<BottomTabs />);
    expect(screen.queryByTestId("tomorrow-draft-dot")).toBeNull();
  });
});
