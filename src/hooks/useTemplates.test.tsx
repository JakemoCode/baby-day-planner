import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTemplates } from "./useTemplates";
import type { OwnershipTemplate } from "@/domain";

const listTemplatesMock = vi.fn();
vi.mock("@/repositories/templates", () => ({
  listTemplates: (...args: unknown[]) => listTemplatesMock(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ db: {} }));

describe("useTemplates", () => {
  it("returns templates from one-shot fetch", async () => {
    const sample: OwnershipTemplate[] = [
      { id: "a", label: "Sat", napOwners: ["Jake"], wakeWindowOwners: ["Kelly"] },
    ];
    listTemplatesMock.mockResolvedValue(sample);
    const { result } = renderHook(() => useTemplates("child-1"));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.templates).toEqual(sample);
    });
  });
});
