import { describe, expect, it } from "vitest";
import {
  CHILDREN,
  INVITES,
  USERS,
  childPath,
  dayPath,
  daysCollectionPath,
  eventPath,
  eventsCollectionPath,
  invitePath,
  settingsPath,
  templatePath,
  templatesCollectionPath,
  tomorrowPlanPath,
  tomorrowPlansCollectionPath,
  userPath,
} from "./paths";

describe("firestore path builders", () => {
  it("exports the top-level collection names", () => {
    expect(CHILDREN).toBe("children");
    expect(USERS).toBe("users");
    expect(INVITES).toBe("invites");
  });

  it("builds child + user + invite paths", () => {
    expect(childPath("c1")).toBe("children/c1");
    expect(userPath("uid-7")).toBe("users/uid-7");
    expect(invitePath("tok-abc")).toBe("invites/tok-abc");
  });

  it("nests settings under the child", () => {
    expect(settingsPath("c1")).toBe("children/c1/settings/current");
  });

  it("nests days collection and per-day doc paths under the child", () => {
    expect(daysCollectionPath("c1")).toBe("children/c1/days");
    expect(dayPath("c1", "2026-05-26")).toBe("children/c1/days/2026-05-26");
  });

  it("nests events under the day", () => {
    expect(eventsCollectionPath("c1", "2026-05-26")).toBe("children/c1/days/2026-05-26/events");
    expect(eventPath("c1", "2026-05-26", "e1")).toBe("children/c1/days/2026-05-26/events/e1");
  });

  it("nests templates under the child", () => {
    expect(templatesCollectionPath("c1")).toBe("children/c1/templates");
    expect(templatePath("c1", "tpl-1")).toBe("children/c1/templates/tpl-1");
  });

  it("nests tomorrow plans under the child, keyed by date", () => {
    expect(tomorrowPlansCollectionPath("c1")).toBe("children/c1/tomorrowPlans");
    expect(tomorrowPlanPath("c1", "2026-05-27")).toBe("children/c1/tomorrowPlans/2026-05-27");
  });
});
