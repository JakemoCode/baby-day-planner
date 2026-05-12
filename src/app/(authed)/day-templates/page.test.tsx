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
import type { Event, OwnersConfig, OwnershipTemplate, Settings } from "@/v3/schemas";
import { aSettings } from "@/v3/__tests__/factories";
import { renderWithAuth, screen, userEvent, waitFor } from "@/test-utils";

// ---- mocks ---------------------------------------------------------------

const useV3SettingsMock = vi.fn();
const useV3TemplatesMock = vi.fn();
const saveTemplateMock = vi.fn();
const onEventTapCapture = vi.fn();

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

// Stub TimelineV3 — the real one is exhaustively tested elsewhere; here
// we just need a way to fire `onEventTap` from the test surface.
vi.mock("@/v3/components/Timeline/TimelineV3", () => ({
  TimelineV3: (props: { events: Event[]; onEventTap?: (e: Event) => void }) => {
    onEventTapCapture.mockImplementation((e: Event) => props.onEventTap?.(e));
    return (
      <ul data-testid="timeline-stub">
        {props.events.map((e) => (
          <li key={e.id} data-event-key={e.eventKey}>
            <button type="button" onClick={() => props.onEventTap?.(e)}>
              tap-{e.eventKey}
            </button>
          </li>
        ))}
      </ul>
    );
  },
}));

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
    // Engine projects nap_1 from the synthetic day; tap the stub's
    // generated button for that eventKey.
    const tapButton = await screen.findByRole("button", { name: "tap-nap_1" });
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
    const tapButton = await screen.findByRole("button", { name: "tap-nap_1" });
    await userEvent.click(tapButton);
    await userEvent.click(await screen.findByRole("button", { name: "Sam" }));
    await waitFor(() => expect(saveTemplateMock).toHaveBeenCalledTimes(1));
    const [, childId, savedTemplate] = saveTemplateMock.mock.calls[0]!;
    expect(childId).toBe("aden");
    expect(savedTemplate.id).toBe("tmpl-saturday");
    // V3 wire shape — `displayName`, not V2's `label`.
    expect(savedTemplate.displayName).toBe("Saturday");
    expect("label" in savedTemplate).toBe(false);
    // Owner slot for nap_1 is index 0; setOwnerInTemplate writes the
    // OwnerRef (slot) — never a display string.
    expect(savedTemplate.napOwners[0]).toEqual({ slot: "parent2" });
  });

  it("ignores taps on non-mappable events (e.g. extra)", async () => {
    // Render and then synthetically dispatch a tap with an unmappable
    // eventKey via the captured callback. The picker must not appear.
    renderWithAuth(<DayTemplatesPage />);
    // Wait for first projection render.
    await screen.findByRole("button", { name: "tap-nap_1" });
    const fakeExtra: Event = {
      id: "extra-1",
      dayId: "tmpl-projection",
      eventKey: "extra-haircut",
      type: "extra",
      kind: "block",
      startTime: 12 * 60,
      endTime: 12 * 60 + 30,
      label: "Haircut",
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
    onEventTapCapture(fakeExtra);
    expect(screen.queryByRole("button", { name: "None" })).not.toBeInTheDocument();
  });
});
