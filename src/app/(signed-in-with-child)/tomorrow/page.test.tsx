/**
 * Tomorrow page (V3 + §F12 PR 3).
 *
 * Verifies the page composition of the F17+F12 draft/confirm UI:
 * status pill, Confirm + Clear buttons, autosave indirection through
 * useTomorrowPlanState. (Promote-to-today was dropped; the auto-
 * apply-at-midnight behavior is exercised via useReconcileActiveDay
 * integration tests, not here.)
 *
 * Plan-state mechanics (load, autosave, hydrate, edit-revert) are
 * covered in integration tests under tests/integration/hooks. This
 * file mocks useTomorrowPlanState at the module boundary so the page
 * test exercises layout + confirm-flow wiring without re-testing
 * Firestore.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithAuth, screen } from "@/test-utils";
import userEvent from "@testing-library/user-event";
import type { Event, OwnersConfig, OwnershipTemplate, TomorrowPlan } from "@/v3/schemas";
import { aSettings } from "@/v3/__tests__/factories";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { useV3Templates } from "@/v3/hooks/useV3Templates";
import {
  useTomorrowPlanState,
  type UseTomorrowPlanStateResult,
} from "@/v3/hooks/useTomorrowPlanState";
import TomorrowPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/v3/hooks/useV3Settings", () => ({ useV3Settings: vi.fn() }));
vi.mock("@/v3/hooks/useV3Templates", () => ({ useV3Templates: vi.fn() }));
vi.mock("@/v3/hooks/useTomorrowPlanState", () => ({ useTomorrowPlanState: vi.fn() }));
vi.mock("@/v3/repositories/templates", () => ({ saveTemplate: vi.fn(async () => undefined) }));
vi.mock("@/lib/firebase/client", () => ({ db: {} }));

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [],
};
const settings = aSettings({ childId: "test-child-id", owners });
const templates: OwnershipTemplate[] = [];

const stubPlanState = (
  overrides: Partial<UseTomorrowPlanStateResult> = {},
): UseTomorrowPlanStateResult => ({
  plan: null,
  loading: false,
  status: "no-plan",
  wakeTime: settings.defaultWakeTime,
  templateId: undefined,
  extras: [],
  ownerOverrides: {},
  hasEdits: false,
  setWakeTime: vi.fn(),
  setTemplateId: vi.fn(),
  upsertExtra: vi.fn(),
  removeExtra: vi.fn(),
  setOwnerOverride: vi.fn(),
  confirm: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined),
  promoteNow: vi.fn(async () => undefined),
  ...overrides,
});

const aConfirmedPlan = (extras: Event[] = []): TomorrowPlan => ({
  childId: "test-child-id",
  date: "2026-05-22",
  status: "confirmed",
  wakeTime: 7 * 60,
  ownerOverrides: {},
  extras,
  confirmedAt: 19 * 60,
});

const aDraftPlan = (extras: Event[] = []): TomorrowPlan => ({
  childId: "test-child-id",
  date: "2026-05-22",
  status: "draft",
  wakeTime: 7 * 60,
  ownerOverrides: {},
  extras,
});

describe("TomorrowPage (V3 + F12 PR 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useV3Settings).mockReturnValue({ settings, loading: false });
    vi.mocked(useV3Templates).mockReturnValue({ templates, loading: false });
    vi.mocked(useTomorrowPlanState).mockReturnValue(stubPlanState());
  });

  it("shows loading until settings resolve", () => {
    vi.mocked(useV3Settings).mockReturnValueOnce({ settings: null, loading: true });
    renderWithAuth(<TomorrowPage />);
    expect(screen.getByText(/loading tomorrow/i)).toBeVisible();
  });

  it("shows loading until templates resolve", () => {
    vi.mocked(useV3Templates).mockReturnValueOnce({ templates: [], loading: true });
    renderWithAuth(<TomorrowPage />);
    expect(screen.getByText(/loading tomorrow/i)).toBeVisible();
  });

  it("renders status pill, Plan form, Preview, Confirm and Clear buttons", () => {
    renderWithAuth(<TomorrowPage />);
    expect(screen.getByText(/no plan yet/i)).toBeVisible();
    expect(screen.getByLabelText(/wake time/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /confirm plan/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /clear plan/i })).toBeVisible();
  });

  it("Confirm is disabled when there are no edits", () => {
    renderWithAuth(<TomorrowPage />);
    expect(screen.getByRole("button", { name: /confirm plan/i })).toBeDisabled();
  });

  it("Clear is disabled when no plan doc exists", () => {
    renderWithAuth(<TomorrowPage />);
    expect(screen.getByRole("button", { name: /clear plan/i })).toBeDisabled();
  });

  it("status pill flips to 'Draft' when planState.status is draft", () => {
    vi.mocked(useTomorrowPlanState).mockReturnValue(
      stubPlanState({
        plan: aDraftPlan(),
        status: "draft",
        hasEdits: true,
      }),
    );
    renderWithAuth(<TomorrowPage />);
    expect(screen.getByText(/^draft$/i)).toBeVisible();
  });

  it("status pill shows 'Confirmed' message when planState.status is confirmed", () => {
    vi.mocked(useTomorrowPlanState).mockReturnValue(
      stubPlanState({
        plan: aConfirmedPlan(),
        status: "confirmed",
        hasEdits: true,
      }),
    );
    renderWithAuth(<TomorrowPage />);
    expect(screen.getByText(/will auto-apply at midnight/i)).toBeVisible();
  });

  it("Confirm button calls planState.confirm when there are edits", async () => {
    const confirm = vi.fn(async () => undefined);
    vi.mocked(useTomorrowPlanState).mockReturnValue(
      stubPlanState({
        plan: aDraftPlan(),
        status: "draft",
        hasEdits: true,
        confirm,
      }),
    );
    renderWithAuth(<TomorrowPage />);
    await userEvent.click(screen.getByRole("button", { name: /confirm plan/i }));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("Clear opens a confirm dialog; confirming calls planState.clear", async () => {
    const clear = vi.fn(async () => undefined);
    vi.mocked(useTomorrowPlanState).mockReturnValue(
      stubPlanState({
        plan: aConfirmedPlan(),
        status: "confirmed",
        clear,
      }),
    );
    renderWithAuth(<TomorrowPage />);
    await userEvent.click(screen.getByRole("button", { name: /clear plan/i }));
    expect(screen.getByText(/draft \/ confirmed plan for tomorrow will be deleted/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
