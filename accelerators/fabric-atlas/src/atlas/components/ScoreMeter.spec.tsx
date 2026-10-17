import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreMeter } from "./ScoreMeter";
import { scoreBand, scoreStyle } from "./score-style";

describe("semantic 0-100 scores", () => {
  it("uses a soft red, amber, green scale with neutral unknowns", () => {
    expect([0, 39, 40, 69, 70, 100, null, NaN].map(scoreBand)).toEqual([
      "low", "low", "mid", "mid", "high", "high", "unknown", "unknown",
    ]);
    expect(scoreStyle(0)["--atlas-score-fill"]).toContain("var(--color-score-low)");
    expect(scoreStyle(50)["--atlas-score-fill"]).toContain("var(--color-score-mid) 100%");
    expect(scoreStyle(100)["--atlas-score-fill"]).toContain("var(--color-score-high) 100%");
    expect(scoreStyle(null)["--atlas-score-fill"]).toBe("var(--color-muted)");
  });

  it("keeps zero accessible and never publishes a numeric value for N/A", () => {
    const { rerender } = render(<ScoreMeter label="Ownership" value={0} />);
    expect(screen.getByRole("meter", { name: "Ownership" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuemax", "100");
    rerender(<ScoreMeter label="Ownership" value={null} />);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.getByText("Ownership: not assessed")).toBeInTheDocument();
  });
});
