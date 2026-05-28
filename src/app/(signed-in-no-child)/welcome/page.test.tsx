/**
 * WelcomePage UI seam test — form wiring, three-step transition, and submit ordering.
 * Real write-chain coverage (schema, rule-friendliness) lives in
 * `tests/integration/onboarding.test.ts` against the real emulator.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type * as Firestore from "firebase/firestore";
import { renderWithAuth, screen, userEvent } from "@/test-utils";

const replaceMock = vi.fn();
const commitMock = vi.fn().mockResolvedValue(undefined);
const setBatchMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn() }),
}));

vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual<typeof Firestore>("firebase/firestore");
  const stubDoc = { id: "generated-child-id", withConverter: vi.fn(() => stubDoc) };
  return {
    ...actual,
    collection: vi.fn(() => ({})),
    doc: vi.fn(() => stubDoc),
    writeBatch: vi.fn(() => ({ set: setBatchMock, commit: commitMock })),
  };
});

vi.mock("@/lib/firebase/client", () => ({ db: {} }));

// Stub TomorrowPreview so the seam test stays focused on form wiring.
vi.mock("@/v3/components/Tomorrow/TomorrowPreview", () => ({
  TomorrowPreview: () => <div data-testid="tomorrow-preview-stub" />,
}));

import WelcomePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  commitMock.mockResolvedValue(undefined);
});

describe("WelcomePage", () => {
  it("Step 1 renders child-identity fields; parent fields belong to step 2", async () => {
    renderWithAuth(<WelcomePage />, { child: null });
    expect(screen.getByLabelText(/Child's name/i)).toBeVisible();
    expect(screen.getByLabelText(/Date of birth/i)).toBeVisible();
    expect(screen.queryByLabelText(/Parent 1 name/i)).toBeNull();
  });

  it("clicking Next on step 1 advances to step 2 — child fields' state survives the transition", async () => {
    renderWithAuth(<WelcomePage />, { child: null });

    await userEvent.type(screen.getByLabelText(/Child's name/i), "Aden");
    await userEvent.type(screen.getByLabelText(/Date of birth/i), "2025-04-10");
    await userEvent.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByLabelText(/Parent 1 name/i)).toBeVisible();
    expect(screen.getByLabelText(/Default wake time/i)).toBeVisible();
  });

  it("Back button on step 2 returns to step 1 without losing child fields", async () => {
    renderWithAuth(<WelcomePage />, { child: null });

    await userEvent.type(screen.getByLabelText(/Child's name/i), "Aden");
    await userEvent.type(screen.getByLabelText(/Date of birth/i), "2025-04-10");
    await userEvent.click(screen.getByRole("button", { name: /Next/i }));
    await userEvent.click(screen.getByRole("button", { name: /Back/i }));

    expect(screen.getByLabelText(/Child's name/i)).toHaveValue("Aden");
    expect(screen.getByLabelText(/Date of birth/i)).toHaveValue("2025-04-10");
  });

  it("Step 2 → Next advances to step 3 preview (TomorrowPreview mounts)", async () => {
    renderWithAuth(<WelcomePage />, { child: null });

    await userEvent.type(screen.getByLabelText(/Child's name/i), "Aden");
    await userEvent.type(screen.getByLabelText(/Date of birth/i), "2025-04-10");
    await userEvent.click(screen.getByRole("button", { name: /Next/i }));

    await userEvent.type(screen.getByLabelText(/Parent 1 name/i), "Jake");
    await userEvent.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByTestId("tomorrow-preview-stub")).toBeVisible();
    expect(screen.getByRole("button", { name: /Start tracking/i })).toBeVisible();
  });

  it("Start tracking commits an atomic 4-doc batch (Child + Settings + User + Day 1) and redirects to /", async () => {
    renderWithAuth(<WelcomePage />, { child: null });

    await userEvent.type(screen.getByLabelText(/Child's name/i), "Aden");
    await userEvent.type(screen.getByLabelText(/Date of birth/i), "2025-04-10");
    await userEvent.click(screen.getByRole("button", { name: /Next/i }));

    await userEvent.clear(screen.getByLabelText(/Parent 1 name/i));
    await userEvent.type(screen.getByLabelText(/Parent 1 name/i), "Jake");
    await userEvent.clear(screen.getByLabelText(/Parent 2 name/i));
    await userEvent.type(screen.getByLabelText(/Parent 2 name/i), "Kelly");
    // Step 2 → Step 3 (preview), then Start tracking.
    await userEvent.click(screen.getByRole("button", { name: /Next/i }));
    await userEvent.click(screen.getByRole("button", { name: /Start tracking/i }));

    // 4 set() calls: Child, Settings, User, Day 1.
    expect(setBatchMock).toHaveBeenCalledTimes(4);
    expect(commitMock).toHaveBeenCalledTimes(1);

    const calls = setBatchMock.mock.calls as Array<[unknown, Record<string, unknown>]>;
    const childDoc = calls[0]?.[1];
    const settingsDoc = calls[1]?.[1];
    const userDoc = calls[2]?.[1];
    const dayDoc = calls[3]?.[1];

    expect(childDoc).toMatchObject({
      id: "generated-child-id",
      displayName: "Aden",
      dateOfBirth: "2025-04-10",
      createdBy: "test-uid-jake",
    });
    expect(settingsDoc).toMatchObject({
      childId: "generated-child-id",
      defaultWakeTime: 7 * 60,
      owners: {
        parent1: { displayName: "Jake" },
        parent2: { displayName: "Kelly" },
      },
    });
    expect(userDoc).toMatchObject({
      uid: "test-uid-jake",
      childIds: ["generated-child-id"],
    });
    expect(dayDoc).toMatchObject({
      childId: "generated-child-id",
      status: "active",
      wakeTime: 7 * 60,
    });

    expect(replaceMock).toHaveBeenCalledWith("/");
  });

  it("trims whitespace in displayName and falls back when parent names are emptied", async () => {
    renderWithAuth(<WelcomePage />, { child: null });

    await userEvent.type(screen.getByLabelText(/Child's name/i), "  Aden  ");
    await userEvent.type(screen.getByLabelText(/Date of birth/i), "2025-04-10");
    await userEvent.click(screen.getByRole("button", { name: /Next/i }));

    await userEvent.clear(screen.getByLabelText(/Parent 1 name/i));
    await userEvent.clear(screen.getByLabelText(/Parent 2 name/i));
    // Parent 1 is required so re-enter; Parent 2 stays empty → defaults to "Parent 2".
    await userEvent.type(screen.getByLabelText(/Parent 1 name/i), "   Jake   ");

    await userEvent.click(screen.getByRole("button", { name: /Next/i }));
    await userEvent.click(screen.getByRole("button", { name: /Start tracking/i }));

    const settingsDoc = setBatchMock.mock.calls[1]?.[1] as Record<string, unknown>;
    const owners = settingsDoc?.owners as {
      parent1: { displayName: string };
      parent2: { displayName: string };
    };
    expect(owners.parent1.displayName).toBe("Jake");
    expect(owners.parent2.displayName).toBe("Parent 2");

    const childDoc = setBatchMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(childDoc.displayName).toBe("Aden");
  });

  it("surfaces an error message and re-enables submit when commit throws", async () => {
    commitMock.mockRejectedValueOnce(new Error("permission denied"));
    renderWithAuth(<WelcomePage />, { child: null });

    await userEvent.type(screen.getByLabelText(/Child's name/i), "Aden");
    await userEvent.type(screen.getByLabelText(/Date of birth/i), "2025-04-10");
    await userEvent.click(screen.getByRole("button", { name: /Next/i }));
    await userEvent.type(screen.getByLabelText(/Parent 1 name/i), "Jake");
    await userEvent.click(screen.getByRole("button", { name: /Next/i }));
    await userEvent.click(screen.getByRole("button", { name: /Start tracking/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/permission denied/i);
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Start tracking/i })).not.toBeDisabled();
  });
});
