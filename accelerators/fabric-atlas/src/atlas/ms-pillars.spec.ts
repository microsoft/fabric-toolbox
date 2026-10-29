import { describe, expect, it } from "vitest";
import { microsoftPillarForFinding, microsoftPillarForPosture } from "./ms-pillars";

describe("Microsoft governance pillar mapping", () => {
  it("maps Atlas posture pillars onto Health, Protect and Trust", () => {
    expect(microsoftPillarForPosture("operations")).toBe("health");
    expect(microsoftPillarForPosture("sensitivity")).toBe("protect");
    expect(microsoftPillarForPosture("access")).toBe("protect");
    expect(microsoftPillarForPosture("documentation")).toBe("trust");
    expect(microsoftPillarForPosture("lineage")).toBe("trust");
  });

  it("treats sensitivity rules as protection despite their metadata category", () => {
    expect(microsoftPillarForFinding({ id: "missing-sensitivity:x", category: "metadata" })).toBe("protect");
    expect(microsoftPillarForFinding({ id: "certified-missing-sensitivity:x", category: "metadata" })).toBe("protect");
    expect(microsoftPillarForFinding({ id: "missing-owner:x", category: "metadata" })).toBe("trust");
    expect(microsoftPillarForFinding({ id: "failed-job:x", category: "operations" })).toBe("health");
  });
});
