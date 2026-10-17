import { describe, expect, it, vi } from "vitest";
import {
  compareCoreCollectorParity,
  CORE_EXCLUDED_CAPABILITIES,
  CORE_EXCLUDED_SECTIONS,
  CORE_PARITY_MAX_DISCREPANCIES,
  CORE_PARITY_MAX_REPORT_TEXT,
  validateCoreCollectorEnvelope,
  type CoreCollectionStatus,
  type CoreCollectorEnvelope,
  type CoreJob,
} from "./core-collector-parity";
import { validateRawSync, type RawSync } from "./live-sync";

const workspaceId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const itemId = "10000000-0000-4000-8000-00000000000a";
const otherItemId = "10000000-0000-4000-8000-00000000000b";
const principalId = "20000000-0000-4000-8000-00000000000a";
const jobId = "30000000-0000-4000-8000-00000000000a";
const correlationId = "40000000-0000-4000-8000-00000000000a";

function coreEnvelope(): CoreCollectorEnvelope {
  const unsupported = () => ({
    status: "unsupported",
    code: "collector-not-migrated",
  } as const);
  return {
    schemaVersion: 2,
    syncMode: "base",
    correlationId,
    workspace: {
      id: workspaceId,
      displayName: "Comparison fixture",
      description: "Fixture metadata only",
      type: "Workspace",
    },
    items: [
      { id: itemId, type: "Lakehouse", displayName: "Fixture lake", workspaceId },
    ],
    roleAssignments: [
      {
        role: "Admin",
        principal: {
          id: principalId,
          displayName: "Fixture principal",
          type: "User",
          userDetails: { userPrincipalName: "fixture@example.invalid" },
        },
      },
    ],
    jobs: [],
    sections: {
      workspace: { status: "complete" },
      items: { status: "complete" },
      roleAssignments: { status: "complete" },
      jobs: { status: "complete" },
      ...Object.fromEntries(CORE_EXCLUDED_SECTIONS.map((name) => [name, unsupported()])),
    } as CoreCollectorEnvelope["sections"],
    capabilities: Object.fromEntries(
      CORE_EXCLUDED_CAPABILITIES.map((name) => [name, unsupported()]),
    ) as CoreCollectorEnvelope["capabilities"],
    errors: [],
    syncedAt: "2026-10-02T09:00:00.000Z",
    lineage: [],
    access: [],
    config: [],
    objectEdges: [],
    schema: {},
    artifactMetadata: {},
    itemMetadata: { [itemId]: { scannerMatched: false, ownerAvailable: false } },
  };
}

function job(overrides: Partial<CoreJob> = {}): CoreJob {
  return {
    id: jobId,
    itemId,
    itemType: "Lakehouse",
    itemDisplayName: "Fixture lake",
    jobType: "Refresh",
    status: "Completed",
    startTimeUtc: "2026-10-02T09:00:00.000Z",
    endTimeUtc: "2026-10-02T09:01:00.000Z",
    ...overrides,
  };
}

describe("validateCoreCollectorEnvelope", () => {
  it("accepts truthful Core-only coverage, without claiming publication authority", () => {
    const raw = coreEnvelope();
    expect(() => validateCoreCollectorEnvelope(raw, workspaceId)).not.toThrow();
    const report = compareCoreCollectorParity(raw, structuredClone(raw));
    expect(report).toMatchObject({
      authoritative: false,
      equal: true,
      coreEqual: true,
      coverageEqual: true,
      discrepancyCount: 0,
      truncated: false,
    });
    expect(report.discrepancies).toEqual([]);
  });

  it("does not make Core-only coverage authoritative under the production validator", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => validateRawSync(coreEnvelope() as unknown as RawSync, workspaceId)).toThrow(/incomplete sync/);
    } finally {
      warning.mockRestore();
    }
  });

  it.each(["collector-not-migrated", "not-collected"])("accepts explicit %s coverage", (code) => {
    const raw = coreEnvelope();
    for (const name of CORE_EXCLUDED_SECTIONS) raw.sections[name].code = code;
    for (const name of CORE_EXCLUDED_CAPABILITIES) raw.capabilities[name].code = code;
    expect(() => validateCoreCollectorEnvelope(raw)).not.toThrow();
  });

  it.each([
    { schemaVersion: 1 },
    { schemaVersion: "2" },
    { syncMode: "complete" },
    { correlationId: "not-a-uuid" },
    { correlationId: null },
    { syncedAt: "not-a-date" },
    { errors: undefined },
    { errors: ["items: upstream-failure"] },
    { errors: [{ message: "upstream failure" }] },
    { errors: ["<html>upstream body</html>"] },
  ])("rejects invalid envelope fields (%j)", (overrides) => {
    expect(() => validateCoreCollectorEnvelope({ ...coreEnvelope(), ...overrides })).toThrow(/Invalid Core parity input/);
  });

  it("permits an omitted correlation ID and canonical UUID case differences", () => {
    const raw = coreEnvelope();
    delete raw.correlationId;
    raw.workspace.id = workspaceId.toUpperCase();
    expect(() => validateCoreCollectorEnvelope(raw, workspaceId)).not.toThrow();
    expect(() => validateCoreCollectorEnvelope(raw, otherItemId)).toThrow(/different-workspace/);
  });

  it.each(["workspace", "items", "roleAssignments"])("requires %s to be complete", (name) => {
    const raw = coreEnvelope();
    expect(() => validateCoreCollectorEnvelope({
      ...raw,
      sections: { ...raw.sections, [name]: { status: "failed", code: "upstream-failure" } },
    })).toThrow(/incomplete-core-section/);
  });

  it.each(CORE_EXCLUDED_SECTIONS)("rejects missing or fabricated %s section coverage", (name) => {
    const raw = coreEnvelope();
    for (const status of ["complete", "failed", undefined]) {
      expect(() => validateCoreCollectorEnvelope({
        ...raw,
        sections: { ...raw.sections, [name]: status ? { status, code: "not-collected" } : undefined },
      })).toThrow();
    }
    raw.sections[name].code = "not-applicable";
    expect(() => validateCoreCollectorEnvelope(raw)).toThrow(/false-advanced-coverage/);
  });

  it.each(CORE_EXCLUDED_CAPABILITIES)("rejects missing or fabricated %s capability coverage", (name) => {
    const raw = coreEnvelope();
    expect(() => validateCoreCollectorEnvelope({
      ...raw, capabilities: { ...raw.capabilities, [name]: { status: "complete" } },
    })).toThrow(/false-advanced-coverage/);
    expect(() => validateCoreCollectorEnvelope({
      ...raw, capabilities: { ...raw.capabilities, [name]: undefined },
    })).toThrow();
  });

  it.each(["lineage", "access", "config", "objectEdges", "objectLineage"])("rejects nonempty advanced %s arrays", (name) => {
    expect(() => validateCoreCollectorEnvelope({
      ...coreEnvelope(), [name]: [{ uncollected: true }],
    })).toThrow(/advanced-data-present/);
  });

  it.each(["schema", "artifactMetadata"])("rejects nonempty advanced %s objects", (name) => {
    expect(() => validateCoreCollectorEnvelope({
      ...coreEnvelope(), [name]: { [itemId]: [] },
    })).toThrow(/advanced-data-present/);
  });

  it.each(["scannerMatched", "ownerAvailable"])("requires explicit false %s for every item", (field) => {
    const raw = coreEnvelope();
    for (const value of [true, undefined, "false"]) {
      expect(() => validateCoreCollectorEnvelope({
        ...raw,
        itemMetadata: { [itemId]: { ...raw.itemMetadata[itemId], [field]: value } },
      })).toThrow(/invalid-item-metadata/);
    }
    expect(() => validateCoreCollectorEnvelope({ ...raw, itemMetadata: {} })).toThrow(/missing-item-metadata/);
  });

  it("rejects unknown coverage, embedded scanner claims and unsanitized fields", () => {
    const raw = coreEnvelope();
    for (const overrides of [
      { sections: { ...raw.sections, madeUpAdvancedSection: { status: "complete" } } },
      { capabilities: { ...raw.capabilities, fakeCoverage: { status: "complete" } } },
      { itemMetadata: { [itemId]: { ...raw.itemMetadata[itemId], owner: { displayName: "Unexpected" } } } },
      { workspace: { ...raw.workspace, accessToken: "secret" } },
      { items: [{ ...raw.items[0], scannerMatched: true }] },
      { roleAssignments: [{ ...raw.roleAssignments[0], rawResponse: "body" }] },
      { jobs: [{ ...job(), failureReason: { message: "body" } }] },
      { responseBody: "body" },
    ]) {
      expect(() => validateCoreCollectorEnvelope({ ...raw, ...overrides })).toThrow(/unexpected-field/);
    }
  });

  it("rejects canonical duplicate items, metadata and identified jobs", () => {
    const raw = coreEnvelope();
    expect(() => validateCoreCollectorEnvelope({
      ...raw, items: [...raw.items, { ...raw.items[0], id: itemId.toUpperCase() }],
    })).toThrow(/duplicate-identity/);
    expect(() => validateCoreCollectorEnvelope({
      ...raw, itemMetadata: { ...raw.itemMetadata, [itemId.toUpperCase()]: raw.itemMetadata[itemId] },
    })).toThrow(/duplicate-identity/);
    expect(() => validateCoreCollectorEnvelope({
      ...raw, jobs: [job(), job({ id: jobId.toUpperCase() })],
    })).toThrow(/duplicate-identity/);
  });

  it("rejects malformed and foreign identities", () => {
    const raw = coreEnvelope();
    for (const overrides of [
      { workspace: { ...raw.workspace, id: "workspace" } },
      { items: [{ ...raw.items[0], id: "item-1" }] },
      { items: [{ ...raw.items[0], workspaceId: otherItemId }] },
      { roleAssignments: [{ role: "Admin", principal: {} }] },
      { jobs: [job({ itemId: otherItemId })] },
      { itemMetadata: { [otherItemId]: raw.itemMetadata[itemId] } },
    ]) {
      expect(() => validateCoreCollectorEnvelope({ ...raw, ...overrides })).toThrow();
    }
  });

  it("accepts unknown real item types without turning them into generic Item records", () => {
    const raw = coreEnvelope();
    raw.items[0].type = "FutureFabricArtifact";
    expect(() => validateCoreCollectorEnvelope(raw)).not.toThrow();
    expect(compareCoreCollectorParity(raw, structuredClone(raw)).equal).toBe(true);
    raw.items[0].type = "Item";
    expect(() => validateCoreCollectorEnvelope(raw)).toThrow(/placeholder-item-type/);
  });

  it.each<CoreCollectionStatus>([
    { status: "complete" },
    { status: "complete", code: "partial-unsupported" },
    { status: "unsupported", code: "endpoint-unsupported" },
    { status: "failed", code: "rate-limited" },
  ])("accepts an explicit jobs outcome %j", (state) => {
    const raw = coreEnvelope();
    raw.sections.jobs = state;
    raw.errors = state.status === "failed" ? ["jobs: rate-limited"] : [];
    expect(() => validateCoreCollectorEnvelope(raw)).not.toThrow();
  });

  it("allows partial jobs on failure but not on unsupported", () => {
    const raw = coreEnvelope();
    raw.jobs = [job()];
    raw.sections.jobs = { status: "failed", code: "upstream-failure" };
    raw.errors = ["jobs: upstream-failure"];
    expect(() => validateCoreCollectorEnvelope(raw)).not.toThrow();
    raw.sections.jobs.status = "unsupported";
    expect(() => validateCoreCollectorEnvelope(raw)).toThrow(/unsupported-jobs-present/);
  });
});

describe("compareCoreCollectorParity", () => {
  it("reports actual advanced gaps separately instead of fabricating Core collector coverage", () => {
    const raw = coreEnvelope();
    const python = {
      ...structuredClone(raw),
      syncMode: "complete",
      sections: Object.fromEntries(Object.keys(raw.sections).map((name) => [name, { status: "complete" }])),
      capabilities: Object.fromEntries(Object.keys(raw.capabilities).map((name) => [name, { status: "complete" }])),
      itemMetadata: { [itemId]: { scannerMatched: true, ownerAvailable: true, owner: { displayName: "Not compared" } } },
      schema: { [itemId]: [{ name: "Not compared" }] },
    };
    const report = compareCoreCollectorParity(raw, python);
    expect(report).toMatchObject({ coreEqual: true, coverageEqual: false, equal: false, authoritative: false });
    expect(report.discrepancies.every((entry) => entry.scope === "coverage")).toBe(true);
    expect(report.discrepancies).toContainEqual({
      scope: "coverage", collection: "itemMetadata", identity: itemId,
      kind: "value-mismatch", field: "scannerMatched",
    });
  });

  it("normalizes UUID case throughout, ignores correlation and collection timestamps", () => {
    const raw = coreEnvelope();
    raw.jobs = [job()];
    const python = structuredClone(raw);
    python.workspace.id = workspaceId.toUpperCase();
    python.items[0].id = itemId.toUpperCase();
    python.items[0].workspaceId = workspaceId.toUpperCase();
    python.roleAssignments[0].principal.id = principalId.toUpperCase();
    python.jobs[0].id = jobId.toUpperCase();
    python.jobs[0].itemId = itemId.toUpperCase();
    python.itemMetadata = { [itemId.toUpperCase()]: raw.itemMetadata[itemId] };
    python.correlationId = otherItemId;
    python.syncedAt = "2026-10-03T11:00:00+02:00";
    expect(compareCoreCollectorParity(raw, python).equal).toBe(true);
  });

  it("compares workspace IDs and only allowlisted workspace and item fields", () => {
    const raw = coreEnvelope();
    const python = structuredClone(raw);
    python.workspace.id = otherItemId;
    python.items[0].workspaceId = otherItemId;
    python.workspace.displayName = "Different workspace name";
    python.items[0].displayName = "Different name";
    const report = compareCoreCollectorParity(raw, python);
    expect(report.discrepancies.map((entry) => `${entry.collection}.${entry.field}`)).toEqual([
      "workspace.displayName", "workspace.id", "items.displayName", "items.workspaceId",
    ]);
    expect(JSON.stringify(report)).not.toContain("Different");
  });

  it("excludes descriptions intentionally omitted by the Core collector", () => {
    const raw = coreEnvelope();
    delete raw.workspace.description;
    const python = structuredClone(raw);
    python.workspace.description = "Python workspace description";
    python.items[0].description = "Python item description";
    expect(compareCoreCollectorParity(raw, python).equal).toBe(true);
    raw.workspace.description = "A different optional description";
    raw.items[0].description = "A different optional item description";
    expect(compareCoreCollectorParity(raw, python).equal).toBe(true);
    expect(() => validateCoreCollectorEnvelope({
      ...raw, workspace: { ...raw.workspace, description: { upstreamBody: "not text" } },
    })).toThrow(/invalid-text/);
  });

  it("normalizes optional capacity/folder UUIDs while preserving non-UUID identifiers", () => {
    const raw = coreEnvelope();
    raw.workspace.capacityId = otherItemId.toUpperCase();
    raw.items[0].folderId = otherItemId.toUpperCase();
    const python = structuredClone(raw);
    python.workspace.capacityId = otherItemId;
    python.items[0].folderId = otherItemId;
    expect(compareCoreCollectorParity(raw, python).equal).toBe(true);
    raw.workspace.capacityId = python.workspace.capacityId = "shared";
    raw.items[0].folderId = python.items[0].folderId = "root";
    expect(compareCoreCollectorParity(raw, python).equal).toBe(true);
    python.items[0].folderId = "Root";
    expect(compareCoreCollectorParity(raw, python).discrepancies).toMatchObject([
      { collection: "items", field: "folderId", kind: "value-mismatch" },
    ]);
  });

  it("preserves role multiplicity and compares principal details", () => {
    const raw = coreEnvelope();
    raw.roleAssignments.push(structuredClone(raw.roleAssignments[0]));
    const python = structuredClone(raw);
    python.roleAssignments.pop();
    const report = compareCoreCollectorParity(raw, python);
    expect(report.counts.rayfin.roleAssignments).toBe(2);
    expect(report.discrepancies).toEqual([{
      scope: "core", collection: "roleAssignments", identity: `${principalId}/role-1`,
      kind: "count-mismatch", rayfinCount: 2, pythonCount: 1,
    }]);
    python.roleAssignments.push(structuredClone(python.roleAssignments[0]));
    python.roleAssignments[1].principal.userDetails!.userPrincipalName = "other@example.invalid";
    expect(compareCoreCollectorParity(raw, python).discrepancies).toMatchObject([
      { collection: "roleAssignments", field: "principal.userDetails.userPrincipalName" },
    ]);
  });

  it("is deterministic under item, role, job and object-key order changes", () => {
    const raw = coreEnvelope();
    raw.items.push({ id: otherItemId, type: "FutureFabricArtifact" });
    raw.itemMetadata[otherItemId] = { scannerMatched: false, ownerAvailable: false };
    raw.roleAssignments.push({ role: "Viewer", principal: { id: principalId } });
    raw.jobs = [job(), job({ itemId: otherItemId })];
    const python = structuredClone(raw);
    python.items[0].displayName = "Changed";
    python.roleAssignments[0].principal.displayName = "Changed";
    python.jobs[0].status = "Failed";
    const expected = compareCoreCollectorParity(raw, python);
    for (const value of [raw, python]) {
      value.items.reverse();
      value.jobs.reverse();
      value.roleAssignments.reverse();
      value.itemMetadata = Object.fromEntries(Object.entries(value.itemMetadata).reverse());
    }
    expect(compareCoreCollectorParity(raw, python)).toEqual(expected);
  });

  it("pairs duplicate role identities as multisets rather than array positions", () => {
    const raw = coreEnvelope();
    raw.roleAssignments.push({
      ...raw.roleAssignments[0], principal: { id: principalId, displayName: "Another spelling" },
    });
    const python = structuredClone(raw);
    python.roleAssignments.reverse();
    expect(compareCoreCollectorParity(raw, python).equal).toBe(true);
  });

  it.each([
    "2026-10-02T11:00:00+02:00",
    "2026-10-02T11:00:00+0200",
    "2026-10-02T09:00:00",
    "2026-10-02 09:00:00.0000000",
    "2026-10-02T09:00:00.0009999Z",
  ])("normalizes valid job timestamps (%s)", (startTimeUtc) => {
    const raw = coreEnvelope();
    raw.jobs = [job()];
    const python = { ...raw, jobs: [job({ startTimeUtc })] };
    expect(compareCoreCollectorParity(raw, python).equal).toBe(true);
  });

  it.each(["2026-02-30T09:00:00Z", "2026-13-01T09:00:00Z", "2026-10-02T24:00:00Z", "2026-10-02", "not-a-date"])(
    "rejects invalid timestamps rather than letting dates silently roll over (%s)",
    (startTimeUtc) => {
      expect(() => compareCoreCollectorParity(coreEnvelope(), {
        ...coreEnvelope(), jobs: [job({ startTimeUtc })],
      })).toThrow(/invalid-timestamp/);
    },
  );

  it("uses fallback job tuples, retaining duplicates and mutable outcome differences", () => {
    const raw = coreEnvelope();
    raw.jobs = [job({ id: undefined }), job({ id: undefined })];
    const python = structuredClone(raw);
    python.jobs[0].startTimeUtc = "2026-10-02T11:00:00+02:00";
    expect(compareCoreCollectorParity(raw, python).equal).toBe(true);
    python.jobs[1].status = "Failed";
    expect(compareCoreCollectorParity(raw, python).discrepancies).toMatchObject([
      { collection: "jobs", kind: "value-mismatch", field: "status" },
    ]);
    python.jobs.pop();
    expect(compareCoreCollectorParity(raw, python).discrepancies).toMatchObject([
      { collection: "jobs", kind: "count-mismatch", rayfinCount: 2, pythonCount: 1 },
    ]);
  });

  it("distinguishes different fallback start times and different item IDs for one job ID", () => {
    const raw = coreEnvelope();
    raw.jobs = [job({ id: undefined })];
    const python = { ...raw, jobs: [job({ id: undefined, startTimeUtc: "2026-10-02T09:00:01Z" })] };
    expect(compareCoreCollectorParity(raw, python).discrepancies.map((entry) => entry.kind)).toEqual([
      "missing-in-python", "missing-in-rayfin",
    ]);
    raw.items.push({ id: otherItemId, type: "Warehouse" });
    raw.itemMetadata[otherItemId] = { scannerMatched: false, ownerAvailable: false };
    raw.jobs = [job(), job({ itemId: otherItemId })];
    expect(() => validateCoreCollectorEnvelope(raw)).not.toThrow();
  });

  it("compares section/capability codes without exposing them", () => {
    const raw = coreEnvelope();
    const python = structuredClone(raw);
    python.sections.jobs = { status: "failed", code: "upstream-failure" };
    python.capabilities.tags.code = "not-collected";
    const report = compareCoreCollectorParity(raw, python);
    expect(report.discrepancies.map((entry) => `${entry.collection}.${entry.identity}.${entry.field}`)).toEqual([
      "sections.jobs.code", "sections.jobs.status", "capabilities.tags.code",
    ]);
    expect(JSON.stringify(report)).not.toContain("upstream-failure");
  });

  it("continues checking coverage after the discrepancy limit is reached", () => {
    const raw = coreEnvelope();
    const python = structuredClone(raw);
    python.workspace.displayName = "Changed";
    python.capabilities.tags.code = "not-collected";
    const report = compareCoreCollectorParity(raw, python, { maxDiscrepancies: 1 });
    expect(report).toMatchObject({
      coreEqual: false, coverageEqual: false, discrepancyCount: 2, truncated: true,
    });
    expect(report.discrepancies).toHaveLength(1);
  });

  it("bounds discrepancies, retains the total, and never truncates input before comparing", () => {
    const raw = coreEnvelope();
    raw.items = Array.from({ length: 120 }, (_, index) => ({
      id: `10000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      type: "Lakehouse",
      displayName: "x".repeat(2_000),
    }));
    raw.itemMetadata = Object.fromEntries(raw.items.map((item) => [
      item.id, { scannerMatched: false, ownerAvailable: false },
    ]));
    const python = structuredClone(raw);
    for (const item of python.items) item.displayName += "y";
    const report = compareCoreCollectorParity(raw, python, { maxDiscrepancies: 3 });
    expect(report).toMatchObject({ discrepancyCount: 120, truncated: true, coreEqual: false });
    expect(report.discrepancies).toHaveLength(3);
    expect(compareCoreCollectorParity(raw, python).discrepancies).toHaveLength(50);
    expect(compareCoreCollectorParity(raw, python, { maxDiscrepancies: 5_000 }).discrepancies).toHaveLength(CORE_PARITY_MAX_DISCREPANCIES);
    for (const entry of report.discrepancies) {
      for (const value of Object.values(entry)) {
        if (typeof value === "string") expect(value.length).toBeLessThanOrEqual(CORE_PARITY_MAX_REPORT_TEXT);
      }
    }
  });

  it("does not leak tokens, upstream bodies, error text or raw compared values", () => {
    const marker = "DO-NOT-LOG-THIS-SECRET";
    const raw = coreEnvelope();
    raw.workspace.description = `Bearer ${marker}`;
    raw.items[0].displayName = marker;
    raw.roleAssignments[0] = { role: marker, principal: { id: marker, displayName: marker } };
    raw.jobs = [job({ id: marker, jobType: marker, status: marker })];
    const python = {
      ...coreEnvelope(),
      upstreamBody: { access_token: marker },
      errors: [`Authorization: Bearer ${marker}`],
      workspace: { ...coreEnvelope().workspace, upstreamBody: marker },
      items: [{ ...coreEnvelope().items[0], access_token: marker }],
      itemMetadata: { [itemId]: { scannerMatched: false, ownerAvailable: false, description: marker } },
      jobs: [{ ...job({ id: undefined, jobType: marker }), failureReason: marker }],
    };
    const before = JSON.stringify({ raw, python });
    const report = compareCoreCollectorParity(raw, python);
    expect(report.equal).toBe(false);
    expect(JSON.stringify(report)).not.toContain(marker);
    expect(JSON.stringify(report)).not.toContain("Bearer");
    expect(JSON.stringify({ raw, python })).toBe(before);
    let failure = "";
    try {
      validateCoreCollectorEnvelope({ ...raw, [marker]: marker });
    } catch (error) {
      failure = String(error);
    }
    expect(failure).toContain("unexpected-field");
    expect(failure).not.toContain(marker);
  });
});
