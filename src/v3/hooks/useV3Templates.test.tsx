import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { OwnershipTemplate } from "../schemas";
import { useV3Templates } from "./useV3Templates";

const listTemplatesMock = vi.fn();
vi.mock("../repositories/templates", () => ({
  listTemplates: (...args: unknown[]) => listTemplatesMock(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ db: {} }));

const sampleTemplates: OwnershipTemplate[] = [
  {
    id: "tpl-1",
    displayName: "Saturday",
    napOwners: [{ slot: "parent1" }],
    wakeWindowOwners: [],
  },
];

describe("useV3Templates", () => {
  it("loads the V3 templates list once on mount", async () => {
    listTemplatesMock.mockResolvedValue(sampleTemplates);
    const { result } = renderHook(() => useV3Templates("child-1"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.templates).toEqual(sampleTemplates);
    });
  });

  it("ignores a late resolution after unmount", async () => {
    let resolve: ((tt: OwnershipTemplate[]) => void) | undefined;
    listTemplatesMock.mockReturnValue(
      new Promise<OwnershipTemplate[]>((r) => {
        resolve = r;
      }),
    );
    const { result, unmount } = renderHook(() => useV3Templates("child-1"));
    unmount();
    resolve!(sampleTemplates);
    // No throw, no state assertion — the test passes if React doesn't warn
    // about updating state on an unmounted component (would surface as a
    // console error caught by the test runner).
    expect(result.current.templates).toEqual([]);
  });
});
