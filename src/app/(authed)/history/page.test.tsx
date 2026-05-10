/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithAuth, screen, userEvent, waitFor } from "@/test-utils";
import type { Day } from "@/v3/schemas";

const pushMock = vi.fn();
const listArchivedDaysMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/v3/repositories/days", () => ({
  listArchivedDays: (...args: unknown[]) => listArchivedDaysMock(...args),
}));

vi.mock("@/lib/firebase/client", () => ({ db: {} }));

import HistoryPage from "./page";

const day = (id: string, date: string): Day => ({
  id,
  childId: "child-1",
  date,
  status: "archived",
  wakeTime: 7 * 60,
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
});

describe("HistoryPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    listArchivedDaysMock.mockReset();
  });

  it("shows the empty state when no archived days exist", async () => {
    listArchivedDaysMock.mockResolvedValue([]);
    renderWithAuth(<HistoryPage />);
    expect(await screen.findByText(/no past days yet|nothing here yet/i)).toBeVisible();
  });

  it("renders archived days newest first", async () => {
    listArchivedDaysMock.mockResolvedValue([
      day("d-old", "2026-05-01"),
      day("d-new", "2026-05-04"),
      day("d-mid", "2026-05-03"),
    ]);
    renderWithAuth(<HistoryPage />);
    const buttons = await screen.findAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveTextContent(/May 4/i);
    expect(buttons[1]).toHaveTextContent(/May 3/i);
    expect(buttons[2]).toHaveTextContent(/May 1/i);
  });

  it("navigates to the date detail page when a card is clicked", async () => {
    listArchivedDaysMock.mockResolvedValue([day("d-new", "2026-05-04")]);
    renderWithAuth(<HistoryPage />);
    const card = await screen.findByRole("button");
    await userEvent.click(card);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/history/2026-05-04"));
  });

  it("requests at most 7 days from the repository", async () => {
    listArchivedDaysMock.mockResolvedValue([]);
    renderWithAuth(<HistoryPage />);
    await waitFor(() => expect(listArchivedDaysMock).toHaveBeenCalled());
    const lastCall = listArchivedDaysMock.mock.calls.at(-1) ?? [];
    expect(lastCall[2]).toBe(7);
  });
});
