import { describe, it, expect } from "vitest";
import { renderWithAuth, screen } from "@/test-utils";
import { EndOfDayCard } from "./EndOfDayCard";

describe("EndOfDayCard", () => {
  it("shows 'Have a good night' before midnight", () => {
    renderWithAuth(
      <EndOfDayCard afterMidnight={false} hasTomorrowPlan={false} onStart={() => {}} />,
    );
    expect(screen.getByText(/have a good night/i)).toBeInTheDocument();
  });

  it("shows 'Tap to start day' prompt + StartDayButton after midnight", () => {
    renderWithAuth(
      <EndOfDayCard afterMidnight={true} hasTomorrowPlan={false} onStart={() => {}} />,
    );
    expect(screen.getByText(/tap to start day/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start new day/i })).toBeInTheDocument();
  });

  it("uses 'Tap to start plan' wording when a Tomorrow Plan exists", () => {
    renderWithAuth(<EndOfDayCard afterMidnight={true} hasTomorrowPlan={true} onStart={() => {}} />);
    expect(screen.getByText(/tap to start plan/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start day from plan/i })).toBeInTheDocument();
  });
});
