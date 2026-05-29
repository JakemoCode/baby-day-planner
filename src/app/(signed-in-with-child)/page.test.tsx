import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithAuth, screen, userEvent, within } from "@/test-utils";
import type { Day, Event, OwnersConfig, Settings } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import { aSettings } from "@/v3/__tests__/factories";
import DashboardPage from "./page";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const useV3DayMock = vi.fn();
const useV3SettingsMock = vi.fn();
const promoteFromPlanMock = vi.fn();
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
  promoteFromPlan: (...args: unknown[]) => promoteFromPlanMock(...args),
}));
// Mocked to keep this test focused on dashboard rendering; rollover seam
// covered by tests/integration/hooks/useReconcileActiveDay.test.tsx.
vi.mock("@/v3/hooks/useReconcileActiveDay", () => ({
  useReconcileActiveDay: () => ({ done: true }),
}));
vi.mock("@/v3/hooks/useV3TomorrowPlan", () => ({
  useV3TomorrowPlan: () => ({ plan: null, loading: false }),
}));
vi.mock("@/v3/repositories/events", () => ({
  createEvent: (...args: unknown[]) => createEventMock(...args),
  // fire-and-forget on mount; no-op so tests don't hit Firestore.
  reconcileDuplicateEventDocs: vi.fn().mockResolvedValue({ deleted: [] }),
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
    childId: "test-child-id",
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
    childId: "test-child-id",
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
  it("shows skeleton while day or settings is loading", () => {
    setupHooks({ dayLoading: true });
    renderWithAuth(<DashboardPage />);
    expect(screen.getByLabelText(/loading dashboard/i)).toBeVisible();
  });

  it("shows skeleton when there is no active day yet (useReconcileActiveDay will create one)", () => {
    // Skeleton holds until useReconcileActiveDay creates the day and the subscription delivers it.
    setupHooks({ day: null, settings: makeSettings() });
    renderWithAuth(<DashboardPage />);
    expect(screen.getByLabelText(/loading dashboard/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Start first day/i })).toBeNull();
  });

  it("wake-gate: Day with wakeTime undefined still shows skeleton (no Wake-up CTA)", () => {
    setupHooks({ day: makeDay({ wakeTime: undefined as unknown as number }) });
    renderWithAuth(<DashboardPage />);
    expect(screen.getByLabelText(/loading dashboard/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Start first day/i })).toBeNull();
  });

  it("settings missing after onboarding: dashboard renders skeleton, not the Wake up gate", () => {
    // Post-onboarding the layout guarantees settings exist; null here is a transient load,
    // not a cue to re-spawn the bootstrap flow.
    setupHooks({ day: null, settings: null });
    renderWithAuth(<DashboardPage />);
    expect(screen.queryByRole("button", { name: /Start first day/i })).toBeNull();
    expect(screen.getByLabelText(/loading dashboard/i)).toBeVisible();
  });

  it("wake-gate: Day with wakeTime === 0 (midnight) is a valid active day", () => {
    setupHooks({ day: makeDay({ wakeTime: 0 }), nowMinutes: 8 * 60 });
    renderWithAuth(<DashboardPage />);
    // wakeTime=0 is a valid wake; dashboard should render normally.
    expect(screen.queryByRole("button", { name: /Start first day/i })).toBeNull();
    expect(screen.getByRole("region", { name: /bottle stats/i })).toBeVisible();
  });

  it("renders dashboard normally past bedtimeThreshold with no upcoming event (F32: no EOD card)", () => {
    setupHooks({
      nowMinutes: 20 * 60, // 8pm, past 19:00 bedtime
      projected: [], // no upcoming event
    });
    renderWithAuth(<DashboardPage />);
    expect(screen.queryByRole("button", { name: /Start first day/i })).toBeNull();
    expect(screen.getByRole("region", { name: /bottle stats/i })).toBeVisible();
  });

  it("shows dashboard normally when there is still an upcoming event after bedtime", () => {
    // Dream feed = a regular bottle whose label happens to be "Dream Feed".
    const upcoming: Event = {
      id: "evt-1",
      dayId: "day-1",
      eventKey: "bottle_6",
      type: "bottle",
      kind: "instant",
      label: "Dream Feed",
      startTime: 22 * 60,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    setupHooks({ nowMinutes: 20 * 60, projected: [upcoming] });
    renderWithAuth(<DashboardPage />);
    expect(screen.queryByRole("button", { name: /Start first day/i })).toBeNull();
    expect(screen.getByRole("region", { name: /bottle stats/i })).toBeVisible();
  });

  it("§F67: Next bottle panel shows the next bottle even when it's >15min out", () => {
    // The next projected bottle is 2h ahead — well outside the ±15min
    // Log-Bottle-Time window (LOG_BOTTLE_WINDOW_MIN). The panel must
    // still announce it; it was previously fed `nearestBottleInWindow`,
    // which returned undefined here and left the "Next bottle" heading
    // with no time. It should be fed `nextBottle` instead.
    const futureBottle: Event = {
      id: "b-future",
      dayId: "day-1",
      eventKey: "bottle_3",
      type: "bottle",
      kind: "instant",
      label: "Bottle 3",
      startTime: 11 * 60, // 11:00 AM, 2h after now
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    setupHooks({ nowMinutes: 9 * 60, projected: [futureBottle] });
    renderWithAuth(<DashboardPage />);
    const panel = within(screen.getByRole("region", { name: /bottle stats/i }));
    expect(panel.getByText("11:00 AM")).toBeVisible();
  });

  it("shows no NowBanner during a wake window — the 'ends' time duplicates Next sleep", () => {
    // The thin banner is sleep-only: it announces in-progress nap/bedtime
    // (elapsed time, shown nowhere else). During a wake window its end time
    // just duplicates the next-nap time in the Next sleep panel, so no banner.
    const wakeWindow: Event = {
      id: "ww-1",
      dayId: "day-1",
      eventKey: "wake_window_1",
      type: "wake_window",
      kind: "block",
      label: "Wake Window 1",
      startTime: 7 * 60,
      endTime: 9 * 60,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    setupHooks({ nowMinutes: 8 * 60, projected: [wakeWindow] });
    renderWithAuth(<DashboardPage />);
    expect(screen.queryByText(/in wake window/i)).toBeNull();
    expect(screen.queryByText(/in progress/i)).toBeNull();
  });

  it("handleEndNap saves completed nap with endTime committed (TIME_EDIT action)", async () => {
    // Nap is in-progress: recorded lifecycle, startTime <= nowMinutes < effectiveEnd
    const inProgressNap: Event = {
      id: "proj_nap_t540", // simulates an auto-promoted projection
      dayId: "day-1",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      endTime: 10 * 60, // placeholder
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
    };
    const { saveEvent } = setupHooks({
      actuals: [inProgressNap],
      // projectDay includes actuals via reality-wins; test mock mirrors that.
      projected: [inProgressNap],
      nowMinutes: 9 * 60 + 30, // 30 min into the nap (within [startTime, endTime])
    });
    renderWithAuth(<DashboardPage />);

    const endBtn = screen.getByRole("button", { name: /End Nap/i });
    endBtn.click();

    // microtask drain so the await in handleEndNap resolves
    await Promise.resolve();

    expect(saveEvent).toHaveBeenCalledTimes(1);
    // id is deterministic `recorded_${eventKey}` so subsequent edits overwrite the same doc.
    expect(saveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "recorded_nap_1",
        endTime: expect.any(Number),
        lifecycle: expect.objectContaining({ state: "completed" }),
      }),
    );
  });

  describe("Wake-up flow: 'End overnight sleep' opens WakeConfirmSheet", () => {
    const inProgressBedtime: Event = {
      id: "bedtime",
      dayId: "day-1",
      eventKey: "bedtime",
      type: "bedtime",
      kind: "block",
      label: "Bedtime",
      startTime: 20 * 60, // 8 PM yesterday-frame
      endTime: 7 * 60 + 24 * 60, // R7.1 placeholder: next-morning 7 AM
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "recorded", annotatedAt: 20 * 60 },
    };

    it("Confirm fires startNewDay with the picked wakeTime (NOT TIME_EDIT on the bedtime directly)", async () => {
      // 6:42 AM "now"; bedtime is in-progress because effectiveEnd extends
      // it past its placeholder endTime overnight.
      const { saveEvent } = setupHooks({
        actuals: [inProgressBedtime],
        nowMinutes: 6 * 60 + 42,
      });
      startNewDayMock.mockResolvedValue({
        archivedDayId: "day-1",
        newDayId: "day-new",
      });
      renderWithAuth(<DashboardPage />);

      // CTA reads "End overnight sleep" when a bedtime is in progress.
      await userEvent.click(screen.getByRole("button", { name: /end overnight sleep/i }));

      // Sheet opens with the time pre-filled to nowMinutes.
      const input = screen.getByLabelText(/wake time/i) as HTMLInputElement;
      expect(input.value).toBe("06:42");

      // User edits to 6:30 (they were checking phone late) and confirms.
      await userEvent.clear(input);
      await userEvent.type(input, "06:30");
      await userEvent.click(screen.getByRole("button", { name: /^start day$/i }));

      // Bedtime trim is startNewDay's responsibility (covered by days.test.ts); saveEvent must NOT be called.
      expect(startNewDayMock).toHaveBeenCalledTimes(1);
      expect(startNewDayMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.objectContaining({ newWakeTime: 6 * 60 + 30 }),
      );
      expect(saveEvent).not.toHaveBeenCalled();
    });

    it("Cancel closes the sheet without firing startNewDay", async () => {
      setupHooks({
        actuals: [inProgressBedtime],
        nowMinutes: 6 * 60 + 42,
      });
      renderWithAuth(<DashboardPage />);

      await userEvent.click(screen.getByRole("button", { name: /end overnight sleep/i }));
      await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

      expect(startNewDayMock).not.toHaveBeenCalled();
      // Sheet is gone from the DOM.
      expect(screen.queryByLabelText(/wake time/i)).toBeNull();
    });
  });

  it("uniqueRecordedKeys counts distinct eventKey across recorded actuals only", () => {
    // Pin clock to active day's date so handleLogBottle takes the same-day path.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-10T09:00:00"));
    // Two recorded docs with the SAME eventKey + one projected (ignored).
    // nextNumber should be 2, not 3.
    const recordedBottle: Event = {
      id: "b1",
      dayId: "day-1",
      eventKey: "bottle_1",
      type: "bottle",
      kind: "instant",
      label: "Bottle 1",
      startTime: 8 * 60,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "completed", committedAt: 8 * 60 },
    };
    const recordedBottleDup: Event = {
      ...recordedBottle,
      id: "b1-update",
      // same eventKey — should NOT bump ordinal
    };
    // Projected bottle within ±15min of nowMinutes so the Log Bottle
    // Time window is open and the contextual button renders.
    const projectedBottle: Event = {
      id: "b-proj",
      dayId: "day-1",
      eventKey: "bottle_2",
      type: "bottle",
      kind: "instant",
      label: "Bottle 2",
      startTime: 9 * 60 + 5,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };

    const { saveEvent } = setupHooks({
      actuals: [recordedBottle, recordedBottleDup, projectedBottle],
      projected: [projectedBottle],
      nowMinutes: 9 * 60,
    });
    renderWithAuth(<DashboardPage />);

    // Log bottle now → eventKey should be bottle_2 (1 unique recorded + 1).
    const btn = screen.getByRole("button", { name: /Log bottle now/i });
    btn.click();

    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(saveEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "bottle_2", label: "Bottle 2" }),
    );
  });

  it("bottle recorded at 2 AM next-day routes to a freshly-created planned day, not the active day", async () => {
    // Wall clock = 2026-05-11 02:00 (day after active day.date = "2026-05-10").
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-11T02:00:00"));

    const plannedTomorrow = makeDay({
      id: "day-tomorrow-id",
      date: "2026-05-11",
      status: "planned",
    });
    getOrCreatePlannedDayMock.mockResolvedValue(plannedTomorrow);
    createEventMock.mockResolvedValue(undefined);

    // Projected bottle at 2 AM next-day frame so the Log bottle now
    // window is open at nowMinutes=2:00.
    const projectedBottle: Event = {
      id: "b-proj-2am",
      dayId: "day-1",
      eventKey: "bottle_dream",
      type: "bottle",
      kind: "instant",
      label: "Dream Feed",
      startTime: 2 * 60,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    const { saveEvent } = setupHooks({
      nowMinutes: 2 * 60,
      projected: [projectedBottle],
    });
    renderWithAuth(<DashboardPage />);

    const btn = screen.getByRole("button", { name: /Log bottle now/i });
    btn.click();

    // Wait for async handler.
    await Promise.resolve();
    await Promise.resolve();

    // Cross-day path: saveEvent must NOT be called (would land on active day).
    // createEvent must use tomorrow's dayId.
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
