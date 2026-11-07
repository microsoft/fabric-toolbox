import { describe, expect, it } from "vitest";
import { capabilityState, groupCapabilities } from "./capability-states";
import { atlasFeatureFlags } from "./feature-flags";

describe("capability states", () => {
  it("separates wired flags from portal-only, deferred and private capabilities", () => {
    expect(capabilityState({ id: "item-relations", enabled: false })).toBe("available-off");
    expect(capabilityState({ id: "item-relations", enabled: true })).toBe("active");
    expect(capabilityState({ id: "ontology", enabled: false })).toBe("active");
    expect(capabilityState({ id: "monitor-hub-alerts", enabled: true })).toBe("portal-only");
    expect(capabilityState({ id: "iq-sharing", enabled: true })).toBe("deferred");
    expect(capabilityState({ id: "spark-runtime-lineage", enabled: true })).toBe("private-preview");
  });

  it("orders every registered capability into a single state group", () => {
    const groups = groupCapabilities(atlasFeatureFlags());
    expect(groups.map((group) => group.state)).toEqual([
      "active",
      "available-off",
      "portal-only",
      "deferred",
      "private-preview",
    ]);
    expect(groups.flatMap((group) => group.flags)).toHaveLength(atlasFeatureFlags().length);
  });
});
