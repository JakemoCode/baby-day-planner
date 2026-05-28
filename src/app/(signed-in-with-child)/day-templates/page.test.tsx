/**
 * DayTemplates page (V3) — verifies hook wiring (useV3Settings, useV3Templates),
 * TimelineV3 tap dispatch, slot-based owner picker, and saveTemplate shape.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OwnersConfig, OwnershipTemplate, Settings } from "@/v3/schemas";
import { aSettings } from "@/v3/__tests__/factories";
import { renderWithAuth, screen, userEvent, waitFor } from "@/test-utils";

// ---- mocks ---------------------------------------------------------------

const useV3SettingsMock = vi.fn();
const useV3TemplatesMock = vi.fn();
const saveTemplateMock = vi.fn();

vi.mock("@/v3/hooks/useV3Settings", () => ({
  useV3Settings: (...args: unknown[]) => useV3SettingsMock(...args),
}));
vi.mock("@/v3/hooks/useV3Templates", () => ({
  useV3Templates: (...args: unknown[]) => useV3TemplatesMock(...args),
}));
vi.mock("@/v3/repositories/templates", () => ({
  saveTemplate: (...args: unknown[]) => saveTemplateMock(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ db: { __mock: "db" } }));

// TimelineV3 renders for real — adds integration coverage that the page wires correct events/owners.

// ---- fixtures -----------------------------------------------------------

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [{ id: "daycare", displayName: "Daycare", color: "#ccc" }],
};

const baseSettings: Settings = aSettings({ childId: "test-child-id", owners });

const saturdayTemplate: OwnershipTemplate = {
  id: "tmpl-saturday",
  displayName: "Saturday",
  napOwners: [{ slot: "parent1" }],
  wakeWindowOwners: [],
};

const sundayTemplate: OwnershipTemplate = {
  id: "tmpl-sunday",
  displayName: "Sunday",
  napOwners: [],
  wakeWindowOwners: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  useV3SettingsMock.mockReturnValue({ settings: baseSettings, loading: false });
  useV3TemplatesMock.mockReturnValue({
    templates: [saturdayTemplate, sundayTemplate],
    loading: false,
  });
  saveTemplateMock.mockResolvedValue(undefined);
});

// ---- component-under-test -----------------------------------------------

import DayTemplatesPage from "./page";

describe("DayTemplatesPage (V3)", () => {
  it("shows loading state while V3 hooks are loading", () => {
    useV3SettingsMock.mockReturnValue({ settings: null, loading: true });
    useV3TemplatesMock.mockReturnValue({ templates: [], loading: true });
    renderWithAuth(<DayTemplatesPage />);
    expect(screen.getByText(/loading day templates/i)).toBeInTheDocument();
  });

  it("shows empty hint when settings are missing after load", () => {
    useV3SettingsMock.mockReturnValue({ settings: null, loading: false });
    useV3TemplatesMock.mockReturnValue({ templates: [], loading: false });
    renderWithAuth(<DayTemplatesPage />);
    expect(screen.getByText(/set up the basics/i)).toBeInTheDocument();
  });

  it("switches between Saturday and Sunday tabs", async () => {
    renderWithAuth(<DayTemplatesPage />);
    const sat = screen.getByRole("tab", { name: "Saturday" });
    const sun = screen.getByRole("tab", { name: "Sunday" });
    expect(sat).toHaveAttribute("aria-selected", "true");
    expect(sun).toHaveAttribute("aria-selected", "false");
    await userEvent.click(sun);
    expect(sun).toHaveAttribute("aria-selected", "true");
    expect(sat).toHaveAttribute("aria-selected", "false");
  });

  it("opens the V3 owner picker when a nap is tapped and clears on Cancel", async () => {
    renderWithAuth(<DayTemplatesPage />);
    // Real TimelineV3 renders nap_1 as a tappable button.
    const tapButton = await screen.findByRole("button", { name: /^Nap 1\b/i });
    await userEvent.click(tapButton);
    // Picker is rendered with the owner buttons (None + parent slots).
    expect(await screen.findByRole("button", { name: "None" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jake" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "None" })).not.toBeInTheDocument();
    });
  });

  it("saves a V3 OwnershipTemplate (displayName, slot OwnerRef) on owner pick", async () => {
    renderWithAuth(<DayTemplatesPage />);
    // Find the real Nap 1 block rendered by TimelineV3.
    const tapButton = await screen.findByRole("button", { name: /^Nap 1\b/i });
    await userEvent.click(tapButton);
    await userEvent.click(await screen.findByRole("button", { name: "Sam" }));
    await waitFor(() => expect(saveTemplateMock).toHaveBeenCalledTimes(1));
    // V3 shape uses `displayName` (not V2's `label`); setOwnerInTemplate writes OwnerRef (slot), never a display string.
    expect(saveTemplateMock).toHaveBeenCalledWith(
      expect.anything(),
      "test-child-id",
      expect.objectContaining({
        id: "tmpl-saturday",
        displayName: "Saturday",
      }),
    );
    const savedTemplate = (
      saveTemplateMock.mock.calls[0] as [unknown, string, OwnershipTemplate]
    )[2];
    // Pin index 0 specifically — templateSlotForEvent assigns nap_1 to index N-1=0.
    // arrayContaining would miss an off-by-one in setOwnerInTemplate.
    expect(savedTemplate.napOwners[0]).toEqual({ slot: "parent2" });
    expect("label" in savedTemplate).toBe(false);
  });

  // "ignores taps on non-mappable events" was removed when TimelineV3 was un-mocked.
  // Gate logic (templateSlotForEvent → undefined) is unit-tested in templateSlot.test.ts.
});
