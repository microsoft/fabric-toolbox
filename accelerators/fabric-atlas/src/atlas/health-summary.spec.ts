import { describe, expect, it } from "vitest";
import { summarizeHealth } from "./health-summary";

describe("summarizeHealth", () => {
  it("separates health from the proportion of assessed items", () => {
    expect(summarizeHealth([
      { health: "healthy" },
      { health: "healthy" },
      { health: "unknown" },
      { health: "unknown" },
    ])).toMatchObject({
      healthPercentage: 100,
      coveragePercentage: 50,
      assessed: 2,
      total: 4,
      unknown: 2,
    });
  });

  it("does not assign a healthy or failing score when every status is unknown", () => {
    expect(summarizeHealth([{ health: "unknown" }])).toMatchObject({
      healthPercentage: null,
      coveragePercentage: 0,
    });
  });

  it("does not turn an empty workspace into zero health", () => {
    expect(summarizeHealth([])).toMatchObject({
      healthPercentage: null,
      coveragePercentage: null,
    });
  });

  it("counts known failing and stale states in the health score", () => {
    expect(summarizeHealth([
      { health: "healthy" },
      { health: "stale" },
      { health: "failing" },
      { health: "unknown" },
    ])).toMatchObject({ healthPercentage: 33, coveragePercentage: 75 });
  });
});
