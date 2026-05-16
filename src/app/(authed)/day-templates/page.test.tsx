/**
 * DayTemplates page (V3) — integration coverage.
 *
 * Mocks the V3 hooks and the V3 templates repo so we can assert the
 * page wires:
 *   - useV3Settings + useV3Templates for data
 *   - TimelineV3 for preview (asserted indirectly via tap dispatch)
 *   - TemplateOwnerPicker (V3, slot-based)
 *   - setOwnerInTemplate (V3) -> OwnerRef gap-filled at the right index
 *   - saveTemplate (V3 repo) called with V3 OwnershipTemplate (displayName)
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

// TimelineV3 is NOT mocked — its unit tests live in TimelineV3.test.tsx;
// letting it render for real here adds integration coverage (page wires
// correct events/owners → real blocks appear and are tappable).

// ---- fixtures -----------------------------------------------------------

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [{ id: "daycare", displayName: "Daycare", color: "#ccc" }],
};

const baseSettings: Settings = aSettings({ childId: "aden", owners });

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
    // Engine projects nap_1 from the synthetic day; the real TimelineV3
    // renders it as a tappable <button> whose aria-label starts with "Nap 1".
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
    // V3 wire shape — `displayName`, not V2's `label`.
    // Owner slot for nap_1 is index 0; setOwnerInTemplate writes the
    // OwnerRef (slot) — never a display string.
    expect(saveTemplateMock).toHaveBeenCalledWith(
      expect.anything(),
      "aden",
      expect.objectContaining({
        id: "tmpl-saturday",
        displayName: "Saturday",
      }),
    );
    const savedTemplate = (
      saveTemplateMock.mock.calls[0] as [unknown, string, OwnershipTemplate]
    )[2];
    // Pin parent2 to index 0 specifically — that's the slot
    // templateSlotForEvent assigns to nap_1 (index = N - 1). A regression
    // in setOwnerInTemplate that wrote to the wrong index would still
    // satisfy arrayContaining; this assertion fails on off-by-one.
    expect(savedTemplate.napOwners[0]).toEqual({ slot: "parent2" });
    expect("label" in savedTemplate).toBe(false);
  });

  // NOTE: "ignores taps on non-mappable events" was removed when TimelineV3
  // was un-mocked. The gate logic (templateSlotForEvent → undefined for
  // extras) is unit-tested in templateSlot.test.ts. Injecting an arbitrary
  // extra event into the real timeline requires synthetic dispatch that
  // isn't available without a mock; the unit coverage is sufficient.
});
