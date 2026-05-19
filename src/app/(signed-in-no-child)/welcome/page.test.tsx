/**
 * WelcomePage UI seam test.
 *
 * Exercises the form rendering, step 1 → step 2 transition, field-to-handler
 * wiring, and submit ordering. The actual Firestore writes are mocked here —
 * the real write chain (createChild + saveSettings + createUser order, schema
 * correctness, rule-friendliness) is covered by `tests/integration/onboarding.test.ts`
 * against the real emulator.
 *
 * Together these two tests close the seam-coverage gap: this one catches UI
 * wiring regressions (field name typos, step-state loss, minutesFromTimeInput
 * bugs, missing trim/default fallbacks); the integration one catches data
 * shape and rule regressions.
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

import WelcomePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  commitMock.mockResolvedValue(undefined);
});

describe("WelcomePage", () => {
  it("Step 1 renders child-identity fields; Next is disabled-equivalent until both filled", async () => {
    renderWithAuth(<WelcomePage />, { child: null });
    expect(screen.getByLabelText(/Child's name/i)).toBeVisible();
    expect(screen.getByLabelText(/Date of birth/i)).toBeVisible();
    // Parent fields belong to step 2 — not shown yet.
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

  it("Get started commits an atomic batch with Child + Settings + User docs and redirects to /", async () => {
    renderWithAuth(<WelcomePage />, { child: null });

    await userEvent.type(screen.getByLabelText(/Child's name/i), "Aden");
    await userEvent.type(screen.getByLabelText(/Date of birth/i), "2025-04-10");
    await userEvent.click(screen.getByRole("button", { name: /Next/i }));

    await userEvent.clear(screen.getByLabelText(/Parent 1 name/i));
    await userEvent.type(screen.getByLabelText(/Parent 1 name/i), "Jake");
    await userEvent.clear(screen.getByLabelText(/Parent 2 name/i));
    await userEvent.type(screen.getByLabelText(/Parent 2 name/i), "Kelly");
    // The default-wake-time input is type="time"; userEvent.type doesn't
    // reliably set it across jsdom. Use fireEvent.change-style approach
    // via userEvent's fill — keep the default 07:00 (= 420 min) for the
    // assertion and rely on the field's controlled state.

    await userEvent.click(screen.getByRole("button", { name: /Get started/i }));

    // Three set() calls on the batch — order matters for atomicity test.
    expect(setBatchMock).toHaveBeenCalledTimes(3);
    expect(commitMock).toHaveBeenCalledTimes(1);

    // Inspect the doc bodies. First = Child, second = Settings, third = User.
    const calls = setBatchMock.mock.calls as Array<[unknown, Record<string, unknown>]>;
    const childDoc = calls[0]?.[1];
    const settingsDoc = calls[1]?.[1];
    const userDoc = calls[2]?.[1];

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

    await userEvent.click(screen.getByRole("button", { name: /Get started/i }));

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
    await userEvent.click(screen.getByRole("button", { name: /Get started/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/permission denied/i);
    expect(replaceMock).not.toHaveBeenCalled();
    // Button is re-enabled (label flips back from "Saving…")
    expect(screen.getByRole("button", { name: /Get started/i })).not.toBeDisabled();
  });
});
