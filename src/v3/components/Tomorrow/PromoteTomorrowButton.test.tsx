/**
 * V3 PromoteTomorrowButton — pure presentational button that invokes
 * the supplied handler. Confirmation flow lives at the page level.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromoteTomorrowButton } from "./PromoteTomorrowButton";

describe("PromoteTomorrowButton (V3)", () => {
  it("renders a 'Promote to today' button", () => {
    render(<PromoteTomorrowButton onPromote={() => {}} />);
    expect(screen.getByRole("button", { name: /promote to today/i })).toBeVisible();
  });

  it("invokes the handler when clicked", async () => {
    const onPromote = vi.fn();
    render(<PromoteTomorrowButton onPromote={onPromote} />);
    await userEvent.click(screen.getByRole("button", { name: /promote to today/i }));
    expect(onPromote).toHaveBeenCalledTimes(1);
  });

  it("renders disabled when the disabled prop is true", () => {
    render(<PromoteTomorrowButton onPromote={() => {}} disabled />);
    expect(screen.getByRole("button", { name: /promote to today/i })).toBeDisabled();
  });

  it("does not invoke the handler when disabled and clicked", async () => {
    const onPromote = vi.fn();
    render(<PromoteTomorrowButton onPromote={onPromote} disabled />);
    await userEvent.click(screen.getByRole("button", { name: /promote to today/i }));
    expect(onPromote).not.toHaveBeenCalled();
  });
});
