/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithAuth, screen } from "@/test-utils";
import type { Day, Event, OwnersConfig, Settings } from "@/v3/schemas";

const getDayByDateMock = vi.fn();
const useV3SettingsMock = vi.fn();
const useV3EventsMock = vi.fn();
const useParamsMock = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => useParamsMock(),
}));

vi.mock("@/v3/repositories/days", () => ({
  getDayByDate: (...args: unknown[]) => getDayByDateMock(...args),
}));

vi.mock("@/v3/hooks/useV3Settings", () => ({
  useV3Settings: () => useV3SettingsMock(),
}));

vi.mock("@/v3/hooks/useV3Events", () => ({
  useV3Events: (...args: unknown[]) => useV3EventsMock(...args),
}));

vi.mock("@/lib/firebase/client", () => ({ db: {} }));

import ArchivedDayPage from "./page";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [],
};

const settings: Settings = {
  childId: "child-1",
  owners,
  putdownLeadMinutes: 15,
} as unknown as Settings;

const day: Day = {
  id: "day-1",
  childId: "child-1",
  date: "2026-05-04",
  status: "archived",
  wakeTime: 7 * 60,
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
};

const bottle: Event = {
  id: "b1",
  dayId: "day-1",
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  startTime: 7 * 60 + 5,
  label: "Bottle 1",
  amountOz: 5,
  hasPutdown: false,
  lifecycle: { state: "completed", committedAt: 7 * 60 + 5 },
};

describe("ArchivedDayPage", () => {
  beforeEach(() => {
    getDayByDateMock.mockReset();
    useV3SettingsMock.mockReset();
    useV3EventsMock.mockReset();
    useParamsMock.mockReset();
    useParamsMock.mockReturnValue({ date: "2026-05-04" });
    useV3SettingsMock.mockReturnValue({ settings, loading: false });
    useV3EventsMock.mockReturnValue({
      events: [],
      loading: false,
      createOptimistic: vi.fn(),
      updateOptimistic: vi.fn(),
      deleteOptimistic: vi.fn(),
    });
  });

  it("renders the day-not-found empty state when no archived day matches", async () => {
    getDayByDateMock.mockResolvedValue(null);
    renderWithAuth(<ArchivedDayPage />);
    expect(await screen.findByText(/Day not found/i)).toBeVisible();
    expect(screen.getByText(/2026-05-04/)).toBeVisible();
  });

  it("renders the archived day view with formatted date heading", async () => {
    getDayByDateMock.mockResolvedValue(day);
    renderWithAuth(<ArchivedDayPage />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/May 4/i);
  });

  it("passes events and settings through to the archived view", async () => {
    getDayByDateMock.mockResolvedValue(day);
    useV3EventsMock.mockReturnValue({
      events: [bottle],
      loading: false,
      createOptimistic: vi.fn(),
      updateOptimistic: vi.fn(),
      deleteOptimistic: vi.fn(),
    });
    renderWithAuth(<ArchivedDayPage />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/May 4/i);
    // useV3Events called with childId, dayId, owners
    expect(useV3EventsMock).toHaveBeenCalledWith(expect.any(String), "day-1", owners);
  });

  it("renders the back link to /history", async () => {
    getDayByDateMock.mockResolvedValue(day);
    renderWithAuth(<ArchivedDayPage />);
    const link = await screen.findByRole("link", { name: /history/i });
    expect(link).toHaveAttribute("href", "/history");
  });
});
