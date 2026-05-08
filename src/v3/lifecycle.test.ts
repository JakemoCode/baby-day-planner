import { describe, expect, it } from "vitest";
import { LifecycleTransitionError, reduceLifecycle, type LifecycleAction } from "./lifecycle";
import type { Lifecycle } from "./schemas";

const projected: Lifecycle = { state: "projected" };

describe("reduceLifecycle — valid transitions", () => {
  it("projected → started via START on a block event", () => {
    const next = reduceLifecycle(projected, {
      type: "START",
      at: 13 * 60,
      eventKind: "block",
    });
    expect(next).toEqual({ state: "started", committedAt: 13 * 60 });
  });

  it("started → completed via END preserves the original committedAt", () => {
    const started: Lifecycle = { state: "started", committedAt: 13 * 60 };
    const next = reduceLifecycle(started, { type: "END", at: 14 * 60 });
    expect(next).toEqual({ state: "completed", committedAt: 13 * 60 });
  });

  it("projected → completed via RECORD_INSTANT for instant events", () => {
    const next = reduceLifecycle(projected, {
      type: "RECORD_INSTANT",
      at: 9 * 60,
      eventKind: "instant",
    });
    expect(next).toEqual({ state: "completed", committedAt: 9 * 60 });
  });

  it("projected → overridden via OWNER_EDIT", () => {
    const next = reduceLifecycle(projected, {
      type: "OWNER_EDIT",
      at: 8 * 60,
    });
    expect(next).toEqual({ state: "overridden", annotatedAt: 8 * 60 });
  });

  it("overridden → completed via TIME_EDIT", () => {
    const overridden: Lifecycle = { state: "overridden", annotatedAt: 8 * 60 };
    const next = reduceLifecycle(overridden, { type: "TIME_EDIT", at: 12 * 60 });
    expect(next).toEqual({ state: "completed", committedAt: 12 * 60 });
  });

  it("OWNER_EDIT on a recorded event is a no-op (returns same state)", () => {
    const completed: Lifecycle = { state: "completed", committedAt: 13 * 60 };
    const next = reduceLifecycle(completed, { type: "OWNER_EDIT", at: 14 * 60 });
    expect(next).toBe(completed);
  });
});

describe("reduceLifecycle — invalid transitions", () => {
  it("throws if START is called with kind=instant", () => {
    expect(() =>
      reduceLifecycle(projected, {
        type: "START",
        at: 9 * 60,
        eventKind: "instant",
      } satisfies LifecycleAction),
    ).toThrow(LifecycleTransitionError);
  });

  it("throws if START is called from non-projected state", () => {
    const completed: Lifecycle = { state: "completed", committedAt: 13 * 60 };
    expect(() =>
      reduceLifecycle(completed, {
        type: "START",
        at: 14 * 60,
        eventKind: "block",
      }),
    ).toThrow(/requires projected state/);
  });

  it("throws if END is called from non-started state", () => {
    expect(() => reduceLifecycle(projected, { type: "END", at: 14 * 60 })).toThrow(
      /requires started state/,
    );
  });

  it("throws if RECORD_INSTANT is called with kind=block", () => {
    expect(() =>
      reduceLifecycle(projected, {
        type: "RECORD_INSTANT",
        at: 9 * 60,
        eventKind: "block",
      }),
    ).toThrow(/instant-only/);
  });

  it("throws if TIME_EDIT is called on a started block (must use END)", () => {
    const started: Lifecycle = { state: "started", committedAt: 13 * 60 };
    expect(() => reduceLifecycle(started, { type: "TIME_EDIT", at: 14 * 60 })).toThrow(/use END/);
  });
});
