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
import type { OwnersConfig, OwnershipTemplate } from "@/v3/schemas";
import { aSettings } from "@/v3/__tests__/factories";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { useV3Templates } from "@/v3/hooks/useV3Templates";
import { startNewDay } from "@/v3/repositories/days";
import { createEvent } from "@/v3/repositories/events";
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

vi.mock("@/v3/repositories/events", () => ({
  createEvent: vi.fn(async () => undefined),
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

const settings = aSettings({ childId: "child-1", owners });

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

  // V3 listTemplates is a one-shot fetch (not a snapshot listener), so
  // the loading flag is the only signal the page has to wait on before
  // the template <select> can render its options.
  it("shows loading until templates resolve", () => {
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
    // The next assertion already proves `args` is defined (would throw
    // on optional-chain undefined). Removing the redundant guard.
    expect(args?.newWakeTime).toBe(7 * 60);
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("persists buffered extras to the new day on promote", async () => {
    render(<TomorrowPage />);
    // Add two extras through the drawer.
    await userEvent.click(screen.getByRole("button", { name: /add extra event/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await userEvent.click(screen.getByRole("button", { name: /add extra event/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await userEvent.click(screen.getByRole("button", { name: /promote to today/i }));

    // Both extras should be written to the events repo, stamped with
    // the new day's id (the same id passed to startNewDay).
    const promoteArgs = vi.mocked(startNewDay).mock.calls[0]?.[2];
    const newDayId = promoteArgs?.newDayId;
    // newDayId is the UUID-shaped string from newDayId() — assert the
    // shape, not just "defined" (a non-empty string is more meaningful
    // and the per-call dayId assertion below would have a misleading
    // error if newDayId were `undefined`).
    expect(newDayId).toMatch(/^day_[0-9a-f]{8}-/);
    expect(createEvent).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(createEvent).mock.calls) {
      expect(call[2].dayId).toBe(newDayId);
    }
  });

  it("uses a UUID-based newDayId (no Date.now()-style ids)", async () => {
    render(<TomorrowPage />);
    await userEvent.click(screen.getByRole("button", { name: /promote to today/i }));
    const args = vi.mocked(startNewDay).mock.calls[0]?.[2];
    // V3 ids must come from crypto.randomUUID() (PR-C1 audit). The
    // `day_` prefix + UUID shape is what newDayId() emits — the old
    // `day-${Date.now()}` regression would not match.
    expect(args?.newDayId).toMatch(/^day_[0-9a-f]{8}-/);
  });

  it("editing the same projected event twice does not duplicate the extra", async () => {
    render(<TomorrowPage />);
    // First "add extra" creates a projected template event and saves
    // it into extras. Re-opening that same event via the timeline tap
    // routes through the edit-of-projected branch; the bug being
    // guarded against is a second save creating a duplicate entry.
    await userEvent.click(screen.getByRole("button", { name: /add extra event/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    // Find the projected extra in the timeline and tap it to re-edit.
    const extraBlock = screen
      .getAllByTestId("timeline-block")
      .find((el) => el.dataset.type === "extra");
    expect(extraBlock).toBeDefined();
    await userEvent.click(extraBlock!);
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    // Tap and save again — verifies the dedup invariant on a 3rd pass.
    const extraBlock2 = screen
      .getAllByTestId("timeline-block")
      .filter((el) => el.dataset.type === "extra");
    expect(extraBlock2).toHaveLength(1);
    await userEvent.click(extraBlock2[0]!);
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    const finalExtras = screen
      .getAllByTestId("timeline-block")
      .filter((el) => el.dataset.type === "extra");
    expect(finalExtras).toHaveLength(1);
  });

  it("promote forwards the selected templateId", async () => {
    render(<TomorrowPage />);
    await userEvent.selectOptions(screen.getByLabelText(/ownership template/i), "tmpl-saturday");
    await userEvent.click(screen.getByRole("button", { name: /promote to today/i }));
    const args = vi.mocked(startNewDay).mock.calls[0]?.[2];
    expect(args?.templateId).toBe("tmpl-saturday");
  });
});
