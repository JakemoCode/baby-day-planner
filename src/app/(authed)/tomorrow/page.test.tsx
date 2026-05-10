/**
 * Tomorrow page (V3 cutover, PR-B3).
 *
 * Verifies the V3 wiring contract:
 *   - V3 hooks gate the loading state.
 *   - Selecting a template feeds the V3 preview (engine output reflects
 *     the template, e.g. owner pills appear).
 *   - The promote button calls V3 `startNewDay` with the form values.
 *
 * Hooks and the V3 days repo are mocked at the module boundary so the
 * test exercises the page composition, not Firestore.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OwnersConfig, OwnershipTemplate, Settings } from "@/v3/schemas";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { useV3Templates } from "@/v3/hooks/useV3Templates";
import { startNewDay } from "@/v3/repositories/days";
import TomorrowPage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/v3/hooks/useV3Settings", () => ({
  useV3Settings: vi.fn(),
}));

vi.mock("@/v3/hooks/useV3Templates", () => ({
  useV3Templates: vi.fn(),
}));

vi.mock("@/v3/repositories/days", () => ({
  startNewDay: vi.fn(async () => ({ archivedDayId: null, newDayId: "day-x" })),
}));

vi.mock("@/v3/repositories/templates", () => ({
  saveTemplate: vi.fn(async () => undefined),
}));

vi.mock("@/lib/firebase/client", () => ({
  db: {},
}));

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [],
};

const settings: Settings = {
  childId: "child-1",
  defaultWakeTime: 7 * 60,
  bedtimeThreshold: 19 * 60,
  defaultNapLengthMinutes: 60,
  shortNapThresholdMinutes: 35,
  shortNapAdjustmentMinutes: 10,
  wakeWindowsMinutes: [120, 135, 135, 150],
  napDurationMin: 30,
  napDurationMax: 180,
  defaultBottleAmountOz: 5,
  defaultBottleIntervalMinutes: 180,
  bottleRules: [],
  bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
  minBottleIntervalMinutes: 90,
  putdownLeadMinutes: 15,
  pumpTimes: [],
  pumpOwnerSlot: "parent2",
  dreamFeedEnabled: false,
  dreamFeedStart: 22 * 60,
  dreamFeedEnd: 23 * 60,
  dreamFeedOffsetAfterBedtimeMinutes: 180,
  dailyRecurring: [],
  daycare: {
    enabled: false,
    dropoffTime: 8 * 60,
    pickupTime: 17 * 60,
    ownerId: "",
    weekdays: {
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    },
  },
  owners,
  timelinePxPerHour: 80,
  timelineDimPast: false,
};

const templates: OwnershipTemplate[] = [
  {
    id: "tmpl-saturday",
    displayName: "Saturday",
    napOwners: [{ slot: "parent1" }, { slot: "parent2" }, { slot: "parent1" }],
    wakeWindowOwners: [{ slot: "parent2" }, { slot: "parent1" }, { slot: "parent2" }],
  },
];

describe("TomorrowPage (V3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useV3Settings).mockReturnValue({ settings, loading: false });
    vi.mocked(useV3Templates).mockReturnValue({ templates, loading: false });
  });

  it("shows loading until settings resolve", () => {
    vi.mocked(useV3Settings).mockReturnValueOnce({ settings: null, loading: true });
    render(<TomorrowPage />);
    expect(screen.getByText(/loading tomorrow/i)).toBeVisible();
  });

  it("shows loading until templates resolve (one-shot fetch)", () => {
    vi.mocked(useV3Templates).mockReturnValueOnce({ templates: [], loading: true });
    render(<TomorrowPage />);
    expect(screen.getByText(/loading tomorrow/i)).toBeVisible();
  });

  it("renders form, preview, and promote button when loaded", () => {
    render(<TomorrowPage />);
    expect(screen.getByLabelText(/wake time/i)).toBeVisible();
    expect(screen.getByLabelText(/ownership template/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /promote to today/i })).toBeVisible();
  });

  it("selecting a template updates the preview with template-derived owners", async () => {
    render(<TomorrowPage />);
    // Before selection: nap blocks have no owner attribute.
    const initialNaps = screen
      .getAllByTestId("timeline-block")
      .filter((el) => el.dataset.type === "nap");
    expect(initialNaps[0]?.dataset.owner).toBeFalsy();

    await userEvent.selectOptions(screen.getByLabelText(/ownership template/i), "tmpl-saturday");

    // After selection: nap blocks pick up owners from the template.
    const naps = screen.getAllByTestId("timeline-block").filter((el) => el.dataset.type === "nap");
    expect(naps[0]?.dataset.owner).toBe("parent1");
  });

  it("promote button calls V3 startNewDay with the form values", async () => {
    render(<TomorrowPage />);
    await userEvent.click(screen.getByRole("button", { name: /promote to today/i }));
    expect(startNewDay).toHaveBeenCalledTimes(1);
    const args = vi.mocked(startNewDay).mock.calls[0]?.[2];
    expect(args).toBeDefined();
    expect(args?.newWakeTime).toBe(7 * 60);
    expect(args?.newDayId).toMatch(/^day-/);
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("promote forwards the selected templateId", async () => {
    render(<TomorrowPage />);
    await userEvent.selectOptions(screen.getByLabelText(/ownership template/i), "tmpl-saturday");
    await userEvent.click(screen.getByRole("button", { name: /promote to today/i }));
    const args = vi.mocked(startNewDay).mock.calls[0]?.[2];
    expect(args?.templateId).toBe("tmpl-saturday");
  });
});
