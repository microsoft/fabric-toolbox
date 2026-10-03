import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VegaVisualProps } from "@microsoft/fabric-visuals";
import { darkThemeColors, lightThemeColors } from "@microsoft/fabric-visuals-core";
import { POSTURE_PILLARS } from "../posture";
import { PostureRadar } from "./PostureRadar";

const harness = vi.hoisted(() => ({ props: undefined as VegaVisualProps | undefined, dark: false }));
vi.mock("@microsoft/fabric-visuals", () => ({
  useCssTheme: () => harness.dark ? darkThemeColors : lightThemeColors,
  VegaVisual: (props: VegaVisualProps) => { harness.props = props; return <div data-testid="vega-radar" className={props.className} />; },
}));
const pillars = POSTURE_PILLARS.map((pillar) => ({ pillar, score: 50, target: 70, metrics: [], contributingFindings: 0 }));

afterEach(() => { harness.dark = false; });

describe("PostureRadar", () => {
  it("bridges CSS theme, a definite height container, tooltips and click selection", () => {
    const onSelect = vi.fn();
    render(<PostureRadar pillars={pillars} selectedPillar="ownership" targetsAvailable onSelect={onSelect} />);
    expect(screen.getByTestId("vega-radar").parentElement).toHaveClass("atlas-posture-chart");
    expect(harness.props?.theme).toBe(lightThemeColors);
    expect(harness.props?.chromeless).toBe(true);
    act(() => harness.props?.onInteraction?.([{
      action: "select", selections: [{ predicates: [{ type: "set", name: "pillar", values: ["operations"] }] }],
    }]));
    expect(onSelect).toHaveBeenCalledWith("operations");
    act(() => harness.props?.onInteraction?.([{ action: "clear" }]));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("responds to dark theme and surfaces chart errors without losing the score controls", () => {
    const { rerender } = render(<PostureRadar pillars={pillars} selectedPillar="access" targetsAvailable onSelect={vi.fn()} />);
    harness.dark = true;
    rerender(<PostureRadar pillars={pillars} selectedPillar="access" targetsAvailable={false} onSelect={vi.fn()} />);
    expect(harness.props?.theme).toBe(darkThemeColors);
    expect(screen.queryByText("Target")).not.toBeInTheDocument();
    act(() => harness.props?.onEvent?.(new CustomEvent("error", {
      detail: { type: "error", level: "error", message: "Spec failed" },
    })));
    expect(screen.getByRole("alert")).toHaveTextContent("six pillar scores and selection controls remain available");
  });
});
