import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import type { Day, Event, OwnersConfig, Settings } from "@/v3/schemas";
import { aSettings } from "@/v3/__tests__/factories";
import DashboardPage from "./page";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const useV3DayMock = vi.fn();
const useV3SettingsMock = vi.fn();
const useV3EventsMock = vi.fn();
const useV3TemplatesMock = vi.fn();
const useV3ProjectionMock = vi.fn();
const useNowMinutesMock = vi.fn();
const startNewDayMock = vi.fn();
const saveSettingsMock = vi.fn();

vi.mock("@/v3/hooks/useV3Day", () => ({
  useV3Day: (...args: unknown[]) => useV3DayMock(...args),
}));
vi.mock("@/v3/hooks/useV3Settings", () => ({
  useV3Settings: (...args: unknown[]) => useV3SettingsMock(...args),
}));
vi.mock("@/v3/hooks/useV3Events", () => ({
  useV3Events: (...args: unknown[]) => useV3EventsMock(...args),
}));
vi.mock("@/v3/hooks/useV3Templates", () => ({
  useV3Templates: (...args: unknown[]) => useV3TemplatesMock(...args),
}));
vi.mock("@/v3/hooks/useV3Projection", () => ({
  useV3Projection: (...args: unknown[]) => useV3ProjectionMock(...args),
}));
vi.mock("@/hooks/useNowMinutes", () => ({
  useNowMinutes: (...args: unknown[]) => useNowMinutesMock(...args),
}));
vi.mock("@/v3/repositories/days", () => ({
  startNewDay: (...args: unknown[]) => startNewDayMock(...args),
}));
vi.mock("@/v3/repositories/settings", () => ({
  saveSettings: (...args: unknown[]) => saveSettingsMock(...args),
}));
vi.mock("@/lib/firebase/client", () => ({
  db: {},
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNERS: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Erin", color: "#f0a" },
  other: [],
};

function makeDay(overrides: Partial<Day> = {}): Day {
  return {
    id: "day-1",
    childId: "aden",
    date: "2026-05-10",
    status: "active",
    wakeTime: 7 * 60,
    suppressedRecurringIds: [],
    suppressedDaycareDay: false,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  // wakeWindowsMinutes empty so the engine doesn't project naps in
  // tests that only care about the day/event wiring.
  return aSettings({
    childId: "aden",
    wakeWindowsMinutes: [],
    owners: OWNERS,
    ...overrides,
  });
}

function setupHooks({
  day = makeDay(),
  settings = makeSettings(),
  actuals = [] as Event[],
  projected = [] as Event[],
  nowMinutes = 8 * 60,
  dayLoading = false,
  settingsLoading = false,
  createOptimistic = vi.fn().mockResolvedValue(undefined),
  updateOptimistic = vi.fn().mockResolvedValue(undefined),
  deleteOptimistic = vi.fn().mockResolvedValue(undefined),
}: {
  day?: Day | null;
  settings?: Settings | null;
  actuals?: Event[];
  projected?: Event[];
  nowMinutes?: number;
  dayLoading?: boolean;
  settingsLoading?: boolean;
  createOptimistic?: ReturnType<typeof vi.fn>;
  updateOptimistic?: ReturnType<typeof vi.fn>;
  deleteOptimistic?: ReturnType<typeof vi.fn>;
} = {}) {
  useV3DayMock.mockReturnValue({ day, loading: dayLoading });
  useV3SettingsMock.mockReturnValue({ settings, loading: settingsLoading });
  useV3EventsMock.mockReturnValue({
    events: actuals,
    loading: false,
    createOptimistic,
    updateOptimistic,
    deleteOptimistic,
  });
  useV3TemplatesMock.mockReturnValue({ templates: [], loading: false });
  useV3ProjectionMock.mockReturnValue(projected);
  useNowMinutesMock.mockReturnValue(nowMinutes);
  return { createOptimistic, updateOptimistic, deleteOptimistic };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardPage (V3)", () => {
  it("shows loading state while day or settings is loading", () => {
    setupHooks({ dayLoading: true });
    renderWithAuth(<DashboardPage />);
    expect(screen.getByText(/Loading today/i)).toBeVisible();
  });

  it("shows EndOfDayCard with start when there is no active day", () => {
    setupHooks({ day: null, settings: null });
    renderWithAuth(<DashboardPage />);
    // EndOfDayCard with afterMidnight=true exposes the start-day region.
    expect(screen.getByLabelText(/Start the new day/i)).toBeVisible();
  });

  it("wake-gate: Day with wakeTime undefined is treated as no active day", () => {
    setupHooks({ day: makeDay({ wakeTime: undefined as unknown as number }) });
    renderWithAuth(<DashboardPage />);
    expect(screen.getByLabelText(/Start the new day/i)).toBeVisible();
  });

  describe("Start New Day flow from the wake-gate", () => {
    // These tests close the audit-flagged P0 gap: page.test.tsx had a
    // startNewDayMock declared but never triggered. The wake-gate
    // handler was completely uncovered. The "Start New Day → no
    // settings doc → silent failure" bug that shipped during
    // click-test would have been caught here.
    it("clicks through Start → Confirm → seeds default settings AND archives+creates day when no settings exist", async () => {
      setupHooks({ day: null, settings: null });
      renderWithAuth(<DashboardPage />);
      await userEvent.click(screen.getByRole("button", { name: /Start New Day/i }));
      await userEvent.click(screen.getByRole("button", { name: /^Confirm$/i }));

      // Settings doc must be seeded BEFORE the day, otherwise the wake-
      // gate re-fires on `!settings` after the day write and the user
      // sees no state change.
      expect(saveSettingsMock).toHaveBeenCalledTimes(1);
      const [, savedChildId, savedSettings] = saveSettingsMock.mock.calls[0] as [
        unknown,
        string,
        Settings,
      ];
      expect(savedChildId).toBe("aden");
      // Seeded settings come from `withV3SettingsDefaults({childId})`, which
      // produces the canonical defaults. defaultWakeTime is 7am.
      expect(savedSettings.defaultWakeTime).toBe(7 * 60);
      expect(savedSettings.childId).toBe("aden");

      expect(startNewDayMock).toHaveBeenCalledTimes(1);
      const [, childId, input] = startNewDayMock.mock.calls[0] as [
        unknown,
        string,
        { newDayId: string; newDate: string; newWakeTime: number },
      ];
      expect(childId).toBe("aden");
      expect(input.newDayId).toMatch(/^day-\d+$/);
      expect(typeof input.newDate).toBe("string");
      expect(input.newDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // No settings → falls back to DEFAULT_WAKE_TIME (7am).
      expect(input.newWakeTime).toBe(7 * 60);
    });

    it("when settings already exist: skips the saveSettings call; just archives+creates day", async () => {
      setupHooks({ day: null, settings: makeSettings({ defaultWakeTime: 8 * 60 + 15 }) });
      renderWithAuth(<DashboardPage />);
      await userEvent.click(screen.getByRole("button", { name: /Start New Day/i }));
      await userEvent.click(screen.getByRole("button", { name: /^Confirm$/i }));

      // Settings already present → no bootstrap write.
      expect(saveSettingsMock).not.toHaveBeenCalled();
      // Day created with the actual configured wake time, not the default.
      expect(startNewDayMock).toHaveBeenCalledTimes(1);
      const [, , input] = startNewDayMock.mock.calls[0] as [
        unknown,
        string,
        { newWakeTime: number },
      ];
      expect(input.newWakeTime).toBe(8 * 60 + 15);
    });

    it("when day exists but wakeTime is undefined: same flow (seeds settings if missing, then archives+creates)", async () => {
      setupHooks({
        day: makeDay({ wakeTime: undefined as unknown as number }),
        settings: null,
      });
      renderWithAuth(<DashboardPage />);
      await userEvent.click(screen.getByRole("button", { name: /Start New Day/i }));
      await userEvent.click(screen.getByRole("button", { name: /^Confirm$/i }));

      expect(saveSettingsMock).toHaveBeenCalledTimes(1);
      expect(startNewDayMock).toHaveBeenCalledTimes(1);
    });
  });

  it("wake-gate: Day with wakeTime === 0 (midnight) is a valid active day", () => {
    setupHooks({ day: makeDay({ wakeTime: 0 }), nowMinutes: 8 * 60 });
    renderWithAuth(<DashboardPage />);
    // Must NOT show the start-day card; should show the dashboard surface
    // with at least the "add an event" FAB.
    expect(screen.queryByLabelText(/Start the new day/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Add an event/i })).toBeVisible();
  });

  it("renders end-of-day card when past bedtimeThreshold and no upcoming event", () => {
    setupHooks({
      nowMinutes: 20 * 60, // 8pm, past 19:00 bedtime
      projected: [], // no upcoming event
    });
    renderWithAuth(<DashboardPage />);
    expect(screen.getByLabelText(/End of day/i)).toBeVisible();
  });

  it("does NOT show end-of-day when there is still an upcoming event after bedtime", () => {
    const upcoming: Event = {
      id: "evt-1",
      dayId: "day-1",
      eventKey: "dream_feed",
      type: "dream_feed",
      kind: "instant",
      label: "Dream feed",
      startTime: 22 * 60,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
    setupHooks({ nowMinutes: 20 * 60, projected: [upcoming] });
    renderWithAuth(<DashboardPage />);
    expect(screen.queryByLabelText(/End of day/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Add an event/i })).toBeVisible();
  });

  it("handleEndNap preserves the nap's start time as committedAt (not the end time)", async () => {
    const startedNap: Event = {
      id: "n-started",
      dayId: "day-1",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      hasPutdown: false,
      // committedAt = the START time captured when the user tapped Start.
      lifecycle: { state: "started", committedAt: 9 * 60 },
    };
    const { updateOptimistic } = setupHooks({
      actuals: [startedNap],
      nowMinutes: 10 * 60, // user taps End at 10:00
    });
    renderWithAuth(<DashboardPage />);

    const endBtn = screen.getByRole("button", { name: /End Nap/i });
    endBtn.click();

    // microtask drain so the await in handleEndNap resolves
    await Promise.resolve();

    expect(updateOptimistic).toHaveBeenCalledTimes(1);
    const [, patch] = updateOptimistic.mock.calls[0] as [
      string,
      { endTime: number; lifecycle: { state: string; committedAt: number } },
    ];
    // endTime is whatever wall clock the button captured — don't pin it.
    expect(typeof patch.endTime).toBe("number");
    expect(patch.lifecycle.state).toBe("completed");
    // committedAt MUST be the original start (9:00), NOT the end time.
    expect(patch.lifecycle.committedAt).toBe(9 * 60);
    expect(patch.lifecycle.committedAt).not.toBe(patch.endTime);
  });

  it("uniqueRecordedKeys counts distinct eventKey across recorded actuals only", () => {
    // Two recorded bottle docs with the SAME eventKey (Start/End pair),
    // plus one projected bottle (must be ignored). nextNumber should be 2,
    // not 3 — verified via the StartBottleButton tracking next ordinal.
    const recordedBottle: Event = {
      id: "b1",
      dayId: "day-1",
      eventKey: "bottle_1",
      type: "bottle",
      kind: "instant",
      label: "Bottle 1",
      startTime: 8 * 60,
      hasPutdown: false,
      lifecycle: { state: "completed", committedAt: 8 * 60 },
    };
    const recordedBottleDup: Event = {
      ...recordedBottle,
      id: "b1-update",
      // same eventKey — should NOT bump ordinal
    };
    const projectedBottle: Event = {
      id: "b-proj",
      dayId: "day-1",
      eventKey: "bottle_2",
      type: "bottle",
      kind: "instant",
      label: "Bottle 2",
      startTime: 11 * 60,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };

    const { createOptimistic } = setupHooks({
      actuals: [recordedBottle, recordedBottleDup, projectedBottle],
      nowMinutes: 9 * 60,
    });
    renderWithAuth(<DashboardPage />);

    // Click Start Bottle Now → handler should produce a Bottle whose
    // eventKey is bottle_2 (1 unique recorded + 1).
    const btn = screen.getByRole("button", { name: /Start Bottle Now/i });
    btn.click();

    expect(createOptimistic).toHaveBeenCalledTimes(1);
    const created = createOptimistic.mock.calls[0]?.[0] as Event;
    expect(created.eventKey).toBe("bottle_2");
    expect(created.label).toBe("Bottle 2");
  });
});
