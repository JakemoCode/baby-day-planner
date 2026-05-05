import { describe, it, expect } from "vitest";
import { CHILDREN, settingsPath, dayPath, eventPath, templatePath } from "./paths";

describe("Firestore paths", () => {
  it("exposes the root collection name", () => {
    expect(CHILDREN).toBe("children");
  });

  it("returns the singleton settings doc path under a child", () => {
    expect(settingsPath("child-1")).toBe("children/child-1/settings/current");
  });

  it("returns a day doc path under a child", () => {
    expect(dayPath("child-1", "day-1")).toBe("children/child-1/days/day-1");
  });

  it("returns an event doc path under a day", () => {
    expect(eventPath("child-1", "day-1", "ev-1")).toBe("children/child-1/days/day-1/events/ev-1");
  });

  it("returns a template doc path under a child", () => {
    expect(templatePath("child-1", "tmpl-saturday")).toBe(
      "children/child-1/templates/tmpl-saturday",
    );
  });
});
