import { describe, expect, it } from "vitest";
import { buildOffboardingReport } from "./offboarding";
import type { AtlasData, Item, Principal } from "./model";

const person: Principal = {
  principalId: "person-1",
  displayName: "Marie",
  email: "marie@example.com",
  kind: "user",
  workspaceRole: "Viewer",
};
const successor: Principal = {
  principalId: "person-2",
  displayName: "Alex",
  email: "alex@example.com",
  kind: "user",
  workspaceRole: "Viewer",
};
const item = (
  fabricId: string,
  ownerEmail?: string,
): Item => ({
  fabricId,
  displayName: fabricId,
  itemType: "Lakehouse",
  ownerEmail,
  ownerMetadataAvailable: true,
  health: "healthy",
  endorsement: "none",
  tags: [],
});

function data(): AtlasData {
  return {
    workspace: {
      fabricId: "workspace",
      displayName: "Workspace",
      capacity: "",
      region: "",
    },
    items: [
      item("upstream", successor.email),
      item("owned", "MARIE@example.com"),
      item("consumer"),
    ],
    principals: [person, successor],
    grants: [
      {
        principalRef: person.principalId,
        itemFabricId: "owned",
        accessLevel: "owner",
        source: "directShare",
      },
      {
        principalRef: successor.principalId,
        itemFabricId: "upstream",
        accessLevel: "owner",
        source: "directShare",
      },
    ],
    edges: [
      { source: "upstream", target: "owned", relation: "feeds" },
      { source: "owned", target: "consumer", relation: "feeds" },
    ],
    jobs: [],
    config: [],
    comments: [],
    syncRuns: [],
    schema: {},
  };
}

describe("buildOffboardingReport", () => {
  it("finds case-insensitive ownership, orphan risk and nearest successor", () => {
    const report = buildOffboardingReport(data(), person.principalId);

    expect(report.blocked).toBe(false);
    expect(report.owned.map((value) => value.fabricId)).toEqual(["owned"]);
    expect(report.soleOwned.map((value) => value.fabricId)).toEqual(["owned"]);
    expect(report.orphanRisk[0].consumers.map((value) => value.id)).toEqual([
      "consumer",
    ]);
    expect(report.reassignment[0]).toMatchObject({
      suggested: { principalId: successor.principalId },
      reasonCode: "nearest-upstream-owner",
    });
  });

  it("blocks ambiguous subjects instead of guessing", () => {
    const value = data();
    value.principals.push({ ...person, principalId: "person-duplicate" });
    value.grants[0].principalRef = "Marie";
    const report = buildOffboardingReport(value, "Marie");

    expect(report.blocked).toBe(true);
    expect(report.subject.resolution).toBe("ambiguous");
    expect(report.ownership).toEqual([]);
  });

  it("does not use owner display names as ownership evidence", () => {
    const value = data();
    value.items[1].ownerEmail = undefined;
    value.items[1].ownerName = "Marie";
    expect(
      buildOffboardingReport(value, person.principalId).owned,
    ).toEqual([]);
  });
});
