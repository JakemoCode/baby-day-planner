import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
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
// §F12/§F17 hooks introduced in PR 2 — mocked to keep the page test
// focused on dashboard rendering, not the rollover seam. The hook itself
// is covered by tests/integration/hooks/useReconcileActiveDay.test.tsx.
vi.mock("@/v3/hooks/useReconcileActiveDay", () => ({
  useReconcileActiveDay: () => ({ done: true }),
}));
vi.mock("@/v3/hooks/useV3TomorrowPlan", () => ({
  useV3TomorrowPlan: () => ({ plan: null, loading: false }),
}));
vi.mock("@/v3/repositories/events", () => ({
  createEvent: (...args: unknown[]) => createEventMock(...args),
  // §F59 fire-and-forget effect on mount; mock to a no-op so tests don't
  // hit the real Firestore module.
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
    // Previously this branch rendered a "Start first day" CTA. Now the
    // skeleton holds the space until useReconcileActiveDay's side-effect
    // creates the active day and the subscription delivers it.
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

  it("settings missing post-§F3: dashboard renders skeleton, not the Wake up gate", () => {
    // After §F3 onboarding, the layout guarantees /users/{uid}.childIds[0]
    // → /children/{id} resolved AND its /settings/current doc exists. If
    // settings turns up null in the dashboard, treat as a transient load —
    // never re-spawn the bootstrap-seed flow that PR #1 removed.
    setupHooks({ day: null, settings: null });
    renderWithAuth(<DashboardPage />);
    expect(screen.queryByRole("button", { name: /Start first day/i })).toBeNull();
    expect(screen.getByLabelText(/loading dashboard/i)).toBeVisible();
  });

  it("wake-gate: Day with wakeTime === 0 (midnight) is a valid active day", () => {
    setupHooks({ day: makeDay({ wakeTime: 0 }), nowMinutes: 8 * 60 });
    renderWithAuth(<DashboardPage />);
    // Must NOT show the Wake up button; should show the dashboard surface
    // with at least the "add an event" FAB.
    expect(screen.queryByRole("button", { name: /Start first day/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Add an event/i })).toBeVisible();
  });

  it("renders dashboard normally past bedtimeThreshold with no upcoming event (F32: no EOD card)", () => {
    setupHooks({
      nowMinutes: 20 * 60, // 8pm, past 19:00 bedtime
      projected: [], // no upcoming event
    });
    renderWithAuth(<DashboardPage />);
    expect(screen.queryByRole("button", { name: /Start first day/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Add an event/i })).toBeVisible();
  });

  it("shows dashboard normally when there is still an upcoming event after bedtime", () => {
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
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    setupHooks({ nowMinutes: 20 * 60, projected: [upcoming] });
    renderWithAuth(<DashboardPage />);
    expect(screen.queryByRole("button", { name: /Start first day/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Add an event/i })).toBeVisible();
  });

  it("handleEndNap saves completed nap with endTime committed (TIME_EDIT action)", async () => {
    // Nap is in-progress: recorded lifecycle, startTime <= nowMinutes < effectiveEnd
    const inProgressNap: Event = {
      id: "n-started",
      dayId: "day-1",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      endTime: 10 * 60, // placeholder endTime set by NapActionButton
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
    };
    const { saveEvent } = setupHooks({
      actuals: [inProgressNap],
      nowMinutes: 9 * 60 + 30, // 30 min into the nap (within [startTime, endTime])
    });
    renderWithAuth(<DashboardPage />);

    const endBtn = screen.getByRole("button", { name: /End Nap/i });
    endBtn.click();

    // microtask drain so the await in handleEndNap resolves
    await Promise.resolve();

    expect(saveEvent).toHaveBeenCalledTimes(1);
    // saveEvent receives the full updated nap. endTime is whatever wall
    // clock the button captured. committedAt is the end time (TIME_EDIT
    // action: the moment the user confirmed "nap is over").
    expect(saveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "n-started",
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
      endTime: 7 * 60 + 24 * 60, // R7.1 placeholder = next-morning 7 AM
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

      // startNewDay is called with newWakeTime = 6:30 in the new day's frame.
      // The bedtime trim is startNewDay's responsibility (covered by
      // days.test.ts) — saveEvent must NOT be called directly here.
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
      owner: NO_OWNER,
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
      owner: NO_OWNER,
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
