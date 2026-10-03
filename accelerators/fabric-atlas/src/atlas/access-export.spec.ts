import { describe, expect, it } from "vitest";
import { GRANT_ONLY_NOTICE, buildAccessEvidenceCoverage } from "./access-coverage";
import { accessRowsToCsv } from "./access-export";
import { buildAccessReviewRows } from "./governance";
import { SAMPLE_DATA } from "./model";

describe("access review CSV evidence", () => {
  it("exports evaluated layers and unknown restrictions on every row", () => {
    const rows = buildAccessReviewRows({
      ...SAMPLE_DATA,
      workspace: { ...SAMPLE_DATA.workspace, snapshotId: "snapshot-id" },
    });
    const csv = accessRowsToCsv(rows);
    const [header, ...lines] = csv.split("\r\n");
    expect(header).toContain('"Highest recorded grant"');
    expect(header).toContain('"Restrictions","Coverage","Evaluated layers","Layer evidence"');
    expect(header).toContain('"Grant sources","Workspace ID","Snapshot ID","Snapshot observed at"');
    expect(header).not.toMatch(/effective permission|effective grants/i);
    expect(lines).toHaveLength(rows.length);
    for (const line of lines) {
      expect(line).toContain('"Not evaluated","Partial"');
      expect(line).toContain("OneLake security: Unsupported");
      expect(line).toContain("Purview DLP: Unsupported");
      expect(line).toContain("Fabric Policies: Evidence unavailable");
      expect(line).toContain('"snapshot-id"');
      expect(line).toContain(GRANT_ONLY_NOTICE);
      expect(line).not.toMatch(/no restrictions|none observed|fully evaluated/i);
    }
  });

  it("retains denied read and incomplete grant provenance without reporting access denied", () => {
    const row = buildAccessReviewRows(SAMPLE_DATA)[0];
    const workspace = {
      ...SAMPLE_DATA.workspace,
      syncSections: { access: { status: "failed" as const, code: "FORBIDDEN" } },
    };
    const itemOnlyGrants = row.applicableGrants
      .filter((grant) => grant.itemFabricId)
      .slice(0, 1);
    const applicableGrants = itemOnlyGrants.length ? itemOnlyGrants : [{
      ...row.applicableGrants[0], itemFabricId: row.itemId,
    }];
    const csv = accessRowsToCsv([{
      ...row, applicableGrants,
      coverage: buildAccessEvidenceCoverage(applicableGrants, workspace),
    }]);
    expect(csv).toContain("Workspace grants: Evidence read denied");
    expect(csv).toContain("Item grants (partial evidence)");
    expect(csv).not.toMatch(/access denied|unrestricted"/i);
  });

  it("marks missing provenance as not recorded, never a fabricated timestamp", () => {
    const row = buildAccessReviewRows(SAMPLE_DATA)[0];
    const csv = accessRowsToCsv([{
      ...row,
      coverage: buildAccessEvidenceCoverage(row.applicableGrants),
    }]);
    expect(csv).toContain('"Not recorded","Not recorded","Not recorded"');
  });

  it("keeps formula neutralization and escaping for added provenance and sources", () => {
    const row = buildAccessReviewRows(SAMPLE_DATA)[0];
    const applicableGrants = [{
      ...row.applicableGrants[0], roleName: 'Role "review"',
    }];
    const csv = accessRowsToCsv([{
      ...row, applicableGrants,
      coverage: {
        ...row.coverage,
        workspaceId: "=HYPERLINK(\"https://example.com\")",
        snapshotId: "+SUM(1,1)",
      },
    }]);
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://example.com\"\")\"");
    expect(csv).toContain("\"'+SUM(1,1)\"");
    expect(csv).toContain('Role ""review""');
  });

  it("exports only the header for an empty filtered set", () => {
    expect(accessRowsToCsv([]).split("\r\n")).toHaveLength(1);
  });
});
