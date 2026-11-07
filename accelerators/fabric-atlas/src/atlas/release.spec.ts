import { describe, expect, it } from "vitest";
import { sameDeploymentGeneration } from "./release";

describe("sameDeploymentGeneration", () => {
  it("keeps patch releases on the same snapshot contract", () => {
    expect(
      sameDeploymentGeneration(
        "1.9.0:old-commit:2026-08-30",
        "1.9.1:new-commit:2026-08-31",
      ),
    ).toBe(true);
    expect(
      sameDeploymentGeneration(
        "1.9.0:snapshot-v1:old-commit:2026-08-30",
        "1.9.1:snapshot-v1:new-commit:2026-08-31",
      ),
    ).toBe(true);
  });

  it("requires a new baseline when the minor contract changes", () => {
    expect(
      sameDeploymentGeneration(
        "1.9.1:old-commit:2026-08-31",
        "1.10.0:new-commit:2026-09-01",
      ),
    ).toBe(false);
  });

  it("requires one guided sync when an explicit contract replaces legacy IDs", () => {
    expect(
      sameDeploymentGeneration(
        "1.9.1:old-commit:2026-08-30",
        "1.9.1:snapshot-v1:new-commit:2026-08-30",
      ),
    ).toBe(false);
  });

  it("fails closed when only one deployment identity is present", () => {
    expect(sameDeploymentGeneration(undefined, "1.9.1:commit:date")).toBe(
      false,
    );
  });
});
