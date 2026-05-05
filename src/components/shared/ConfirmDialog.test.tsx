import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders nothing when open is false", () => {
    renderWithAuth(
      <ConfirmDialog open={false} title="x" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders title and body when open", () => {
    renderWithAuth(
      <ConfirmDialog
        open
        title="Archive today and start fresh?"
        body="Today's data will be moved to History."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: /archive today/i })).toBeInTheDocument();
    expect(screen.getByText(/Today's data will be moved/)).toBeInTheDocument();
  });

  it("invokes onConfirm when Confirm is clicked", async () => {
    const onConfirm = vi.fn();
    renderWithAuth(<ConfirmDialog open title="x" onConfirm={onConfirm} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("invokes onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    renderWithAuth(<ConfirmDialog open title="x" onConfirm={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("uses custom button labels when provided", () => {
    renderWithAuth(
      <ConfirmDialog
        open
        title="Delete this Bottle 2 entry?"
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
  });

  it("closes on Escape key", async () => {
    const onCancel = vi.fn();
    renderWithAuth(<ConfirmDialog open title="x" onConfirm={() => {}} onCancel={onCancel} />);
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
