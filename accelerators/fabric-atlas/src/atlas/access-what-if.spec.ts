import { describe, expect, it } from "vitest";
import {
  WHAT_IF_NOTICE,
  accessWhatIfToCsv,
  accessWhatIfToMarkdown,
  modeledAccessLayerSummary,
  recordedGrantPaths,
  simulateAccessGrantRemoval,
  whatIfOutcomeDescription,
} from "./access-what-if";
import { buildAccessReviewRows, highestRecordedGrant } from "./governance";
import { unknownAccessLayerSummary } from "./access-coverage";
import type { Grant, WorkspaceInfo } from "./model";

const workspace: WorkspaceInfo = {
  fabricId: "workspace-id", displayName: "Workspace", capacity: "F2", region: "West Europe",
  snapshotId: "snapshot-id", syncedAt: "2026-10-02T12:00:00.000Z",
  syncSections: { access: { status: "complete" } },
};
const inherited: Grant = {
  principalRef: "user-id", source: "workspaceRole", accessLevel: "edit", roleName: "Contributor",
};
const direct: Grant = {
  principalRef: "user-id", itemFabricId: "item-id", source: "directShare", accessLevel: "view", roleName: "Read",
};
function row(grants: Grant[] = [inherited, direct], scope = workspace) {
  return buildAccessReviewRows({
    workspace: scope,
    items: [{ fabricId: "item-id", displayName: "Item", itemType: "Lakehouse", health: "healthy", endorsement: "none", tags: [] }],
    principals: [{ principalId: "user-id", displayName: "Analyst", kind: "user", workspaceRole: "Contributor" }],
    grants,
  })[0];
}

describe("local recorded-grant What-if", () => {
  it("uses the review engine and retains inherited access when a lower item grant is excluded", () => {
    const review = row();
    const paths = recordedGrantPaths(review);
    const result = simulateAccessGrantRemoval(review, [paths.find((path) => path.layer === "item-grants")!.key]);
    expect(result.currentLevel).toBe(highestRecordedGrant(review.applicableGrants));
    expect(result.simulatedLevel).toBe("edit");
    expect(result.outcome).toBe("unchanged");
    expect(result.remaining[0].grant.source).toBe("workspaceRole");
    expect(whatIfOutcomeDescription(result)).toContain("highest recorded grant unchanged");
    expect(result.modeledLayers).toEqual(["workspace-grants", "item-grants"]);
  });

  it("retains the direct item path after all inherited paths are excluded", () => {
    const review = row();
    const result = simulateAccessGrantRemoval(review,
      recordedGrantPaths(review).filter((path) => path.layer === "workspace-grants").map((path) => path.key),
    );
    expect(result.currentLevel).toBe("edit");
    expect(result.simulatedLevel).toBe("view");
    expect(result.outcome).toBe("reduced");
    expect(result.remaining.map((path) => path.grant.source)).toEqual(["directShare"]);
  });

  it("reports no remaining positive recorded grants, never proof of access removal", () => {
    const review = row([direct]);
    const result = simulateAccessGrantRemoval(review, recordedGrantPaths(review).map((path) => path.key));
    expect(result.simulatedLevel).toBe("none");
    expect(result.remaining).toEqual([]);
    expect(result.modeledLayers).toEqual(["item-grants"]);
    expect(whatIfOutcomeDescription(result)).toContain("does not prove that actual access is removed");
    for (const content of [accessWhatIfToMarkdown(result), accessWhatIfToCsv(result)]) {
      expect(content).toContain("No positive recorded grant");
      expect(content).toContain("OneLake security: Unsupported");
      expect(content).toContain("Purview DLP: Unsupported");
      expect(content).toContain("Fabric Policies: Evidence unavailable");
      expect(content).toContain("Not evaluated");
      expect(content).not.toMatch(/no restrictions|access is denied|access removed|unrestricted access/i);
    }
  });

  it("keeps group and other item grant records without simulating membership changes", () => {
    const groupGrant: Grant = { ...direct, source: "group", accessLevel: "owner" };
    const review = row([inherited, direct, groupGrant]);
    const paths = recordedGrantPaths(review);
    const result = simulateAccessGrantRemoval(review, [paths.find((path) => path.grant.source === "directShare")!.key]);
    expect(result.simulatedLevel).toBe("owner");
    expect(result.remaining.map((path) => path.grant.source)).toContain("group");
    expect(unknownAccessLayerSummary(review.coverage)).toContain("Group membership: Evidence unavailable");
    const withoutItemPaths = simulateAccessGrantRemoval(review,
      paths.filter((path) => path.layer === "item-grants").map((path) => path.key),
    );
    expect(withoutItemPaths.simulatedLevel).toBe("edit");
  });

  it("ignores stale exclusion keys and can reset immediately", () => {
    const review = row();
    const removed = simulateAccessGrantRemoval(review, recordedGrantPaths(review).map((path) => path.key));
    expect(removed.simulatedLevel).toBe("none");
    const reset = simulateAccessGrantRemoval(review, ["stale-key"]);
    expect(reset.excluded).toEqual([]);
    expect(reset.simulatedLevel).toBe(review.effectiveAccess);
    expect(whatIfOutcomeDescription(reset)).toBe("No recorded grant paths are excluded.");
  });

  it("deduplicates exact observations, remains deterministic and does not mutate source evidence", () => {
    const review = row([inherited, direct, { ...inherited }]);
    const before = JSON.stringify(review);
    review.applicableGrants.forEach(Object.freeze);
    Object.freeze(review.applicableGrants);
    const paths = recordedGrantPaths(review);
    expect(paths).toHaveLength(2);
    expect(paths.find((path) => path.layer === "workspace-grants")?.observations).toBe(2);
    expect(recordedGrantPaths({ ...review, applicableGrants: [...review.applicableGrants].reverse() })).toEqual(paths);
    simulateAccessGrantRemoval(review, paths.map((path) => path.key));
    expect(JSON.stringify(review)).toBe(before);
  });

  it("never models an unrelated item's grant or a name-matched path", () => {
    const review = row([inherited]);
    review.applicableGrants = [
      ...review.applicableGrants,
      { ...direct, itemFabricId: "unrelated-item-id" },
    ];
    expect(recordedGrantPaths(review)).toHaveLength(1);
    expect(simulateAccessGrantRemoval(review, []).modeledLayers).toEqual(["workspace-grants"]);
  });

  it("keeps denied, partial and missing evidence explicit after modeling retained grants", () => {
    const review = row([inherited], {
      ...workspace, syncSections: { access: { status: "failed", code: "FORBIDDEN" } },
    });
    const result = simulateAccessGrantRemoval(review, recordedGrantPaths(review).map((path) => path.key));
    expect(modeledAccessLayerSummary(result)).toBe("Workspace grants (recorded paths only; Partial)");
    expect(unknownAccessLayerSummary(review.coverage)).toContain("Item grants: Evidence read denied");
    expect(accessWhatIfToMarkdown(result)).toContain("Assessment coverage: Partial");
    expect(accessWhatIfToCsv(result)).toContain("Item grants: Evidence read denied");
  });

  it("exports snapshot provenance, all modeled layers and the remaining paths' source/role/evidence", () => {
    const result = simulateAccessGrantRemoval(row(), []);
    const markdown = accessWhatIfToMarkdown(result);
    expect(markdown).toContain(WHAT_IF_NOTICE);
    expect(markdown).toContain("Snapshot ID: snapshot-id");
    expect(markdown).toContain("Snapshot observed at: 2026-10-02T12:00:00.000Z");
    expect(markdown).toContain("source workspaceRole; role Contributor; grant Edit; reference user-id; scope Workspace");
    expect(markdown).toContain("source directShare; role Read; grant View; reference user-id; scope item-id");
    expect(markdown).toContain("Workspace grants (recorded paths only; Observed grants)");
    expect(markdown).toContain("Item grants (recorded paths only; Observed grants)");
  });

  it("escapes Markdown/CSV metadata and excludes unrelated token-like fields", () => {
    const review = { ...row(), principalRef: '=HYPERLINK("https://example.com")', token: "SECRET_TOKEN" };
    review.item = { ...review.item, displayName: "[Item](javascript:alert(1))<img>" };
    const result = simulateAccessGrantRemoval(review, []);
    const markdown = accessWhatIfToMarkdown(result);
    const csv = accessWhatIfToCsv(result);
    expect(markdown).toContain("\\[Item\\]\\(javascript:alert\\(1\\)\\)\\<img\\>");
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://example.com\"\")\"");
    expect(markdown + csv).not.toContain("SECRET_TOKEN");
  });

  it("fails closed if coverage records or provenance are missing", () => {
    const review = { ...row(), coverage: { state: "partial" as const, layers: [] } };
    const result = simulateAccessGrantRemoval(review, []);
    expect(modeledAccessLayerSummary(result)).toContain("coverage unavailable");
    expect(unknownAccessLayerSummary(review.coverage)).toContain("OneLake security: Evidence unavailable");
    expect(accessWhatIfToMarkdown(result)).toContain("Snapshot observed at: Not recorded");
  });
});
