import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { POSTURE_PILLARS } from "../posture";
import { PostureRadar } from "./PostureRadar";

const pillars = POSTURE_PILLARS.map((pillar, index) => ({
  pillar,
  score: [25, 50, 75, 90, null, 100][index],
  target: 80,
  metrics: [],
  contributingFindings: 0,
}));

describe("PostureRadar", () => {
  it("renders six keyboard-accessible pillar controls and selection", () => {
    const onSelect = vi.fn();
    render(
      <PostureRadar
        pillars={pillars}
        selectedPillar="ownership"
        targetsAvailable
        onSelect={onSelect}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Six governance posture pillars on a zero to one hundred scale",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(6);
    expect(
      screen.getByRole("button", { name: /Ownership: 50%/ }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: /Lineage: N\/A/ }),
    );
    expect(onSelect).toHaveBeenCalledWith("lineage");
    expect(screen.getByText("Target")).toBeInTheDocument();
  });

  it("keeps missing scores explicit and hides unavailable targets", () => {
    render(
      <PostureRadar
        pillars={pillars}
        selectedPillar="access"
        targetsAvailable={false}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Lineage: N\/A/ }),
    ).toHaveTextContent("N/A");
    expect(screen.queryByText("Target")).not.toBeInTheDocument();
    expect(screen.getByText("0-100 · N/A is anchored at 0")).toBeInTheDocument();
    const chart = screen.getByRole("img", {
      name: "Six governance posture pillars on a zero to one hundred scale",
    });
    expect(
      chart.querySelector('polygon[fill="var(--color-primary)"]'),
    ).toBeInTheDocument();
    expect(
      chart.querySelectorAll('line[stroke="var(--color-primary)"]'),
    ).toHaveLength(6);
  });
});
