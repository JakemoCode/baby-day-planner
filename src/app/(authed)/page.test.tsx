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
const getOrCreatePlannedDayMock = vi.fn();
const createEventMock = vi.fn();
const saveSettingsMock = vi.fn();
const saveEventMock = vi.fn().mockResolvedValue(undefined);

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
  getOrCreatePlannedDay: (...args: unknown[]) => getOrCreatePlannedDayMock(...args),
}));
vi.mock("@/v3/repositories/events", () => ({
  createEvent: (...args: unknown[]) => createEventMock(...args),
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
  saveEvent = saveEventMock,
  deleteOptimistic = vi.fn().mockResolvedValue(undefined),
}: {
  day?: Day | null;
  settings?: Settings | null;
  actuals?: Event[];
  projected?: Event[];
  nowMinutes?: number;
  dayLoading?: boolean;
  settingsLoading?: boolean;
  saveEvent?: ReturnType<typeof vi.fn>;
  deleteOptimistic?: ReturnType<typeof vi.fn>;
} = {}) {
  useV3DayMock.mockReturnValue({ day, loading: dayLoading });
  useV3SettingsMock.mockReturnValue({ settings, loading: settingsLoading });
  useV3EventsMock.mockReturnValue({
    events: actuals,
    loading: false,
    saveEvent,
    deleteOptimistic,
  });
  useV3TemplatesMock.mockReturnValue({ templates: [], loading: false });
  useV3ProjectionMock.mockReturnValue(projected);
  useNowMinutesMock.mockReturnValue(nowMinutes);
  return { saveEvent, deleteOptimistic };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  saveEventMock.mockResolvedValue(undefined);
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
      // Seeded settings come from `withV3SettingsDefaults({childId})`, which
      // produces the canonical defaults. defaultWakeTime is 7am.
      expect(saveSettingsMock).toHaveBeenCalledWith(
        expect.anything(),
        "aden",
        expect.objectContaining({ defaultWakeTime: 7 * 60, childId: "aden" }),
      );

      expect(startNewDayMock).toHaveBeenCalledTimes(1);
      // No settings → falls back to DEFAULT_WAKE_TIME (7am).
      expect(startNewDayMock).toHaveBeenCalledWith(
        expect.anything(),
        "aden",
        expect.objectContaining({
          newDayId: expect.stringMatching(/^day-\d+$/),
          newDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          newWakeTime: 7 * 60,
        }),
      );
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
      expect(startNewDayMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ newWakeTime: 8 * 60 + 15 }),
      );
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
    // A post-bedtime bottle (this is how a dream feed manifests in the
    // new render-only-label model — a regular bottle whose label happens
    // to be "Dream Feed").
    const upcoming: Event = {
      id: "evt-1",
      dayId: "day-1",
      eventKey: "bottle_6",
      type: "bottle",
      kind: "instant",
      label: "Dream Feed",
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
    const { saveEvent } = setupHooks({
      actuals: [startedNap],
      nowMinutes: 10 * 60, // user taps End at 10:00
    });
    renderWithAuth(<DashboardPage />);

    const endBtn = screen.getByRole("button", { name: /End Nap/i });
    endBtn.click();

    // microtask drain so the await in handleEndNap resolves
    await Promise.resolve();

    expect(saveEvent).toHaveBeenCalledTimes(1);
    // saveEvent receives the full updated nap. endTime is whatever wall
    // clock the button captured — don't pin it. committedAt MUST be the
    // original start (9:00 = 540), NOT the end time (10:00 = 600). The
    // objectContaining assertion for committedAt: 9 * 60 already implies
    // they differ (nowMinutes is 10 * 60), so no extra not.toBe guard needed.
    expect(saveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "n-started",
        endTime: expect.any(Number),
        lifecycle: expect.objectContaining({ state: "completed", committedAt: 9 * 60 }),
      }),
    );
  });

  it("uniqueRecordedKeys counts distinct eventKey across recorded actuals only", () => {
    // Pin the wall clock to the test day's date so the §F22 calendar-day
    // routing in handleLogBottle takes the same-day branch (i.e. uses
    // createOptimistic, not the cross-day createEvent path).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-10T09:00:00"));
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

    const { saveEvent } = setupHooks({
      actuals: [recordedBottle, recordedBottleDup, projectedBottle],
      nowMinutes: 9 * 60,
    });
    renderWithAuth(<DashboardPage />);

    // Click Start Bottle Now → handler should produce a Bottle whose
    // eventKey is bottle_2 (1 unique recorded + 1).
    const btn = screen.getByRole("button", { name: /Start Bottle Now/i });
    btn.click();

    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(saveEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "bottle_2", label: "Bottle 2" }),
    );
  });

  it("§F22 — bottle recorded at 2 AM next-day routes to a freshly-created planned day, not the active day", async () => {
    // Pin the wall clock to 2 AM on the day AFTER the active day's date.
    // Active day.date = "2026-05-10"; wall clock = 2026-05-11 02:00.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-11T02:00:00"));

    const plannedTomorrow = makeDay({
      id: "day-tomorrow-id",
      date: "2026-05-11",
      status: "planned",
    });
    getOrCreatePlannedDayMock.mockResolvedValue(plannedTomorrow);
    createEventMock.mockResolvedValue(undefined);

    const { saveEvent } = setupHooks({ nowMinutes: 2 * 60 });
    renderWithAuth(<DashboardPage />);

    const btn = screen.getByRole("button", { name: /Start Bottle Now/i });
    btn.click();

    // Wait for async handler.
    await Promise.resolve();
    await Promise.resolve();

    // Cross-day path: saveEvent NOT called (would land on active day via
    // hook's dayId). getOrCreatePlannedDay called with the wall-clock date.
    // createEvent called with the bottle docked under tomorrow's id.
    expect(saveEvent).not.toHaveBeenCalled();
    expect(getOrCreatePlannedDayMock).toHaveBeenCalledTimes(1);
    expect(getOrCreatePlannedDayMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "2026-05-11",
      expect.anything(),
    );
    expect(createEventMock).toHaveBeenCalledTimes(1);
    expect(createEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ type: "bottle", dayId: "day-tomorrow-id" }),
    );
  });
});
