import { describe, expect, it } from "vitest";
import {
  accessReviewEvidenceKey,
  serializeAccessReviewEvidence,
} from "./access-review-evidence";
import { buildAccessReviewRows } from "./governance";
import type { AtlasData, Grant } from "./model";

function dataWithGrants(grants: Grant[]): AtlasData {
  return {
    workspace: {
      fabricId: "11111111-1111-4111-8111-111111111111",
      displayName: "Workspace",
      capacity: "Capacity",
      region: "Region",
    },
    items: [
      {
        fabricId: "22222222-2222-4222-8222-222222222222",
        displayName: "Model",
        itemType: "SemanticModel",
        health: "healthy",
        endorsement: "none",
        tags: [],
      },
    ],
    principals: [
      {
        principalId: "33333333-3333-4333-8333-333333333333",
        displayName: "Analyst",
        email: "analyst@example.com",
        kind: "user",
        workspaceRole: "Viewer",
      },
    ],
    grants,
    edges: [],
    jobs: [],
    config: [],
    comments: [],
    syncRuns: [],
  };
}

const WORKSPACE_OWNER: Grant = {
  principalRef: "33333333-3333-4333-8333-333333333333",
  accessLevel: "owner",
  source: "workspaceRole",
  roleName: "Admin",
};

const DIRECT_VIEW: Grant = {
  itemFabricId: "22222222-2222-4222-8222-222222222222",
  principalRef: "analyst@example.com",
  accessLevel: "view",
  source: "directShare",
};

describe("access review evidence", () => {
  it("is stable when grant order and display names change", async () => {
    const initial = dataWithGrants([WORKSPACE_OWNER, DIRECT_VIEW]);
    const reordered = dataWithGrants([DIRECT_VIEW, WORKSPACE_OWNER]);
    reordered.items[0].displayName = "Renamed model";
    reordered.principals[0].displayName = "Renamed analyst";

    const initialRow = buildAccessReviewRows(initial)[0];
    const reorderedRow = buildAccessReviewRows(reordered)[0];

    expect(serializeAccessReviewEvidence(reorderedRow)).toBe(
      serializeAccessReviewEvidence(initialRow),
    );
    await expect(accessReviewEvidenceKey(reorderedRow)).resolves.toBe(
      await accessReviewEvidenceKey(initialRow),
    );
  });

  it("changes when a contributing grant changes but the strongest level does not", async () => {
    const initialRow = buildAccessReviewRows(
      dataWithGrants([WORKSPACE_OWNER, DIRECT_VIEW]),
    )[0];
    const changedRow = buildAccessReviewRows(
      dataWithGrants([
        WORKSPACE_OWNER,
        { ...DIRECT_VIEW, accessLevel: "edit" },
      ]),
    )[0];

    expect(initialRow.effectiveAccess).toBe("owner");
    expect(changedRow.effectiveAccess).toBe("owner");
    await expect(accessReviewEvidenceKey(changedRow)).resolves.not.toBe(
      await accessReviewEvidenceKey(initialRow),
    );
  });

  it("changes when principal resolution changes", async () => {
    const resolved = dataWithGrants([DIRECT_VIEW]);
    const unresolved = dataWithGrants([DIRECT_VIEW]);
    unresolved.principals = [];

    const resolvedRow = buildAccessReviewRows(resolved)[0];
    const unresolvedRow = buildAccessReviewRows(unresolved)[0];

    expect(resolvedRow.principalResolution).toBe("resolved");
    expect(unresolvedRow.principalResolution).toBe("unresolved");
    await expect(accessReviewEvidenceKey(unresolvedRow)).resolves.not.toBe(
      await accessReviewEvidenceKey(resolvedRow),
    );
  });
});
