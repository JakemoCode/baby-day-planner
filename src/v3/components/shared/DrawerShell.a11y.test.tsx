import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "@/test-utils";
import type { Event } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { aDay, aSettings } from "../../__tests__/factories";
import { DrawerShell } from "./DrawerShell";

const napEvent: Event = {
  id: "nap-1",
  dayId: "d-1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  startTime: 9 * 60,
  endTime: 10 * 60,
  label: "Nap 1",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
};

describe("DrawerShell a11y", () => {
  it("open edit drawer has no structural a11y violations", async () => {
    const { container } = render(
      <DrawerShell
        drawer={{ open: true, mode: "edit", event: napEvent }}
        settings={aSettings()}
        day={aDay({ wakeTime: 7 * 60 })}
        nowMinutes={8 * 60 + 30}
        projected={[napEvent]}
        onSave={() => {}}
        onDelete={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
