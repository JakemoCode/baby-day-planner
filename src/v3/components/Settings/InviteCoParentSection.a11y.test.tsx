import { describe, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test-utils";
import { InviteCoParentSection } from "./InviteCoParentSection";

vi.mock("@/lib/firebase/client", () => ({ db: {} }));
vi.mock("@/v3/repositories/invites", () => ({ createInvite: vi.fn() }));
vi.mock("@/lib/invites/sendInviteEmail", () => ({ sendInviteEmail: vi.fn() }));

describe("InviteCoParentSection a11y", () => {
  it("has no axe violations in the initial (pre-token) state", async () => {
    await expectNoA11yViolations(<InviteCoParentSection />);
  });
});
