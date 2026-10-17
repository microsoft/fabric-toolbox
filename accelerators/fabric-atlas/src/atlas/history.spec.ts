import { describe, expect, it } from "vitest";
import {
  buildAtlasHistory,
  changeFieldValue,
  compareSnapshots,
  readableChangeValue,
  snapshotDataForInspection,
  snapshotFromData,
  summarizeSnapshot,
  type HistoricalSnapshot,
} from "./history";
import { parseOntologyMetadata } from "./item-metadata";
import type { AtlasData, Item } from "./model";

function item(
  fabricId: string,
  overrides: Partial<Item> = {},
): Item {
  return {
    fabricId,
    displayName: fabricId,
    itemType: "Lakehouse",
    health: "healthy",
    endorsement: "none",
    tags: [],
    ...overrides,
  };
}

function data(overrides: Partial<AtlasData> = {}): AtlasData {
  return {
    workspace: {
      fabricId: "workspace",
      displayName: "Workspace",
      capacity: "F2",
      region: "West Europe",
    },
    items: [],
    edges: [],
    principals: [],
    grants: [],
    jobs: [],
    config: [],
    comments: [],
    syncRuns: [],
    schema: {},
    ...overrides,
  };
}

function snapshot(
  snapshotId: string,
  syncedAt: string,
  value: AtlasData,
): HistoricalSnapshot {
  return snapshotFromData(value, snapshotId, syncedAt);
}

describe("snapshot history", () => {
  it("keeps full expressions and converts validated snapshots for inspection", () => {
    const historical = snapshot(
      "old",
      "2026-08-28T10:00:00.000Z",
      data({
        items: [item("model", { itemType: "SemanticModel" })],
        schema: {
          model: [
            {
              name: "Measures",
              columns: [],
              measures: [
                {
                  name: "Revenue",
                  expr: 'CALCULATE(SUM(Sales[Amount]), Sales[Region] = "<West>")',
                },
              ],
            },
          ],
        },
      }),
    );
    const inspected = snapshotDataForInspection(historical);
    const expression =
      inspected.schema!.model[0].measures[0].expr;

    expect(inspected.comments).toEqual([]);
    expect(inspected.syncRuns).toEqual([]);
    expect(readableChangeValue(expression)).toContain(
      'Sales[Region] = "<West>"',
    );
    expect(changeFieldValue({ expression }, "expression")).toBe(expression);
  });

  it("reports every supported change domain without treating missing jobs as removals", () => {
    const previous = snapshot(
      "old",
      "2026-08-28T10:00:00.000Z",
      data({
        items: [
          item("removed"),
          item("retained", {
            displayName: "Old name",
            sensitivity: " ",
            tags: ["Gold", "finance"],
          }),
        ],
        grants: [
          {
            itemFabricId: "retained",
            principalRef: "Changed",
            accessLevel: "view",
            source: "directShare",
          },
          {
            principalRef: "Removed",
            accessLevel: "view",
            source: "workspaceRole",
          },
        ],
        edges: [
          {
            source: "removed",
            target: "retained",
            relation: "depends on",
          },
          {
            source: "retained",
            target: "removed",
            relation: "reads",
          },
        ],
        jobs: [
          {
            itemFabricId: "retained",
            itemName: "Retained",
            jobType: "Refresh",
            status: "running",
            startedAt: "2026-08-28T09:00:00.000Z",
            durationSec: 1,
          },
          {
            itemFabricId: "removed",
            itemName: "Rolled out",
            jobType: "Refresh",
            status: "completed",
            startedAt: "2026-08-27T09:00:00.000Z",
            durationSec: 1,
          },
        ],
        schema: {
          retained: [
            {
              name: "Sales",
              rows: 10,
              columns: [
                { name: "RemovedColumn", dataType: "string" },
                { name: "ChangedColumn", dataType: "string" },
              ],
              measures: [],
            },
          ],
        },
      }),
    );
    const current = snapshot(
      "new",
      "2026-08-29T10:00:00.000Z",
      data({
        items: [
          item("added"),
          item("retained", {
            displayName: "New name",
            sensitivity: "Confidential",
            tags: ["FINANCE", "gold", "gold"],
          }),
        ],
        grants: [
          {
            itemFabricId: "retained",
            principalRef: "Changed",
            accessLevel: "edit",
            source: "directShare",
          },
          {
            principalRef: "Added",
            accessLevel: "view",
            source: "workspaceRole",
          },
        ],
        edges: [
          {
            source: "removed",
            target: "retained",
            relation: "depends on",
            broken: true,
          },
          {
            source: "added",
            target: "retained",
            relation: "writes",
          },
        ],
        jobs: [
          {
            itemFabricId: "retained",
            itemName: "Retained",
            jobType: "Refresh",
            status: "failed",
            startedAt: "2026-08-28T09:00:00.000Z",
            durationSec: 2,
          },
          {
            itemFabricId: "added",
            itemName: "Added",
            jobType: "Refresh",
            status: "completed",
            startedAt: "2026-08-29T09:00:00.000Z",
            durationSec: 1,
          },
        ],
        schema: {
          retained: [
            {
              name: "Sales",
              rows: 20,
              columns: [
                { name: "ChangedColumn", dataType: "int64" },
                { name: "AddedColumn", dataType: "string" },
              ],
              measures: [{ name: "Revenue", expr: "SUM(Sales[Amount])" }],
            },
          ],
        },
      }),
    );

    const changes = compareSnapshots(previous, current);
    expect(changes.map((change) => change.type)).toEqual(
      expect.arrayContaining([
        "item-added",
        "item-removed",
        "item-modified",
        "schema-object-added",
        "schema-object-removed",
        "schema-object-modified",
        "access-grant-added",
        "access-grant-removed",
        "access-grant-changed",
        "sensitivity-changed",
        "lineage-added",
        "lineage-removed",
        "lineage-broken-state-changed",
        "job-new",
        "job-status-changed",
      ]),
    );
    expect(changes.some((change) => change.type === ("job-removed" as never))).toBe(
      false,
    );
    expect(
      changes.find(
        (change) =>
          change.type === "schema-object-modified" &&
          change.objectName === "ChangedColumn",
      ),
    ).toMatchObject({
      objectType: "column",
      objectName: "ChangedColumn",
      tableName: "Sales",
    });
  });

  it("preserves view identity for targeted Asset Catalog navigation", () => {
    const previous = snapshot(
      "old",
      "2026-08-28T10:00:00.000Z",
      data({ items: [item("model", { itemType: "SemanticModel" })] }),
    );
    const current = snapshot(
      "new",
      "2026-08-29T10:00:00.000Z",
      data({
        items: [item("model", { itemType: "SemanticModel" })],
        schema: {
          model: [
            {
              name: "ActiveCustomers",
              objectType: "View",
              columns: [],
              measures: [],
            },
          ],
        },
      }),
    );

    expect(
      compareSnapshots(previous, current).find(
        (change) => change.type === "schema-object-added",
      ),
    ).toMatchObject({
      objectType: "view",
      objectName: "ActiveCustomers",
    });
  });

  it("classifies ontology changes with stable object identities", () => {
    const previous = snapshot(
      "old",
      "2026-09-01T10:00:00.000Z",
      data({
        items: [item("ontology", { itemType: "Ontology" })],
        itemMetadata: {
          ontology: parseOntologyMetadata({
            entities: [
              {
                id: "device",
                name: "Device",
                properties: [
                  { id: "status", name: "Status", valueType: "String" },
                ],
              },
              { id: "site", name: "Site", properties: [] },
            ],
            relationships: [],
            bindings: [],
            contextualizations: [],
          })!,
        },
      }),
    );
    const current = snapshot(
      "new",
      "2026-09-02T10:00:00.000Z",
      data({
        items: [item("ontology", { itemType: "Ontology" })],
        itemMetadata: {
          ontology: parseOntologyMetadata({
            entities: [
              {
                id: "device",
                name: "Device",
                properties: [
                  { id: "status", name: "Status", valueType: "Int64" },
                ],
              },
              { id: "site", name: "Site", properties: [] },
            ],
            relationships: [
              {
                id: "installed-at",
                name: "Installed at",
                sourceEntityId: "device",
                targetEntityId: "site",
              },
            ],
            bindings: [],
            contextualizations: [],
          })!,
        },
      }),
    );

    const changes = compareSnapshots(previous, current);
    expect(
      changes.find(
        (change) =>
          change.type === "schema-object-modified" &&
          change.objectName === "Status",
      ),
    ).toMatchObject({
      objectType: "ontologyProperty",
      objectId: "device/status",
      tableName: "Device",
    });
    expect(
      changes.find(
        (change) =>
          change.type === "schema-object-added" &&
          change.objectName === "Installed at",
      ),
    ).toMatchObject({
      objectType: "ontologyRelationship",
      objectId: "installed-at",
    });
  });

  it("does not report access churn when principal references migrate to IDs", () => {
    const previous = snapshot(
      "old",
      "2026-08-28T10:00:00.000Z",
      data({
        items: [item("model")],
        principals: [
          {
            principalId: "analyst@example.com",
            displayName: "Analyst",
            email: "analyst@example.com",
            kind: "user",
            workspaceRole: "Viewer",
          },
        ],
        grants: [
          {
            itemFabricId: "model",
            principalRef: "analyst@example.com",
            accessLevel: "view",
            source: "directShare",
          },
        ],
      }),
    );
    const current = snapshot(
      "new",
      "2026-08-29T10:00:00.000Z",
      data({
        items: [item("model")],
        principals: [
          {
            principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            displayName: "Analyst",
            email: "analyst@example.com",
            kind: "user",
            workspaceRole: "Viewer",
          },
        ],
        grants: [
          {
            itemFabricId: "model",
            principalRef: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            accessLevel: "view",
            source: "directShare",
          },
        ],
      }),
    );

    expect(
      compareSnapshots(previous, current).filter(
        (change) => change.domain === "access",
      ),
    ).toEqual([]);
  });

  it("reports a sensitivity ID change only in the sensitivity domain", () => {
    const previous = snapshot(
      "old",
      "2026-08-28T10:00:00.000Z",
      data({
        items: [
          item("model", {
            sensitivity: "Confidential",
            sensitivityLabelId: "label-old",
            sensitivityMetadataAvailable: true,
          }),
        ],
      }),
    );
    const current = snapshot(
      "new",
      "2026-08-29T10:00:00.000Z",
      data({
        items: [
          item("model", {
            sensitivity: "Confidential",
            sensitivityLabelId: "label-new",
            sensitivityMetadataAvailable: true,
          }),
        ],
      }),
    );

    expect(compareSnapshots(previous, current).map((change) => change.type)).toEqual([
      "sensitivity-changed",
    ]);

    const resolvedName = snapshot(
      "resolved",
      "2026-08-30T10:00:00.000Z",
      data({
        items: [
          item("model", {
            sensitivity: "Confidential",
            sensitivityLabelId: "label-new",
            sensitivityMetadataAvailable: true,
          }),
        ],
      }),
    );
    const idOnly = snapshot(
      "id-only",
      "2026-08-29T10:00:00.000Z",
      data({
        items: [
          item("model", {
            sensitivityLabelId: "label-new",
            sensitivityMetadataAvailable: true,
          }),
        ],
      }),
    );
    expect(compareSnapshots(idOnly, resolvedName)).toEqual([]);
  });

  it("ignores ordering-only changes, normalizes tags, and gives stable ordering and IDs", () => {
    const first = snapshot(
      "old",
      "2026-08-28T10:00:00.000Z",
      data({
        items: [
          item("a", { tags: ["Gold", "Finance"], sensitivity: " " }),
          item("b"),
        ],
      }),
    );
    const secondData = data({
      items: [
        item("b"),
        item("a", {
          tags: ["finance", "GOLD", "gold"],
          sensitivity: undefined,
        }),
      ],
    });
    const second = snapshot(
      "new",
      "2026-08-29T10:00:00.000Z",
      secondData,
    );
    expect(compareSnapshots(first, second)).toEqual([]);

    secondData.items[0].displayName = "B changed";
    secondData.items[1].displayName = "A changed";
    const changed = snapshot(
      "new",
      "2026-08-29T10:00:00.000Z",
      secondData,
    );
    const forward = compareSnapshots(first, changed);
    const reordered = compareSnapshots(
      first,
      snapshot("new", changed.syncedAt, {
        ...secondData,
        items: [...secondData.items].reverse(),
      }),
    );
    expect(reordered.map(({ id, type }) => ({ id, type }))).toEqual(
      forward.map(({ id, type }) => ({ id, type })),
    );
  });

  it("builds chronological trend metrics and newest-first summaries", () => {
    const old = snapshot(
      "old",
      "2026-08-28T10:00:00.000Z",
      data({ items: [item("old", { health: "stale" })] }),
    );
    const current = snapshot(
      "new",
      "2026-08-29T10:00:00.000Z",
      data({
        items: [
          item("healthy", { sensitivity: "Confidential" }),
          item("failing", { health: "failing" }),
        ],
        principals: [
          {
            principalId: "guest",
            displayName: "Guest",
            kind: "guest",
            external: true,
            workspaceRole: "Viewer",
          },
        ],
        grants: [
          {
            principalRef: "Guest",
            accessLevel: "view",
            source: "workspaceRole",
          },
        ],
        jobs: [
          {
            itemFabricId: "failing",
            itemName: "Failing",
            jobType: "Refresh",
            status: "failed",
            startedAt: "2026-08-29T09:00:00.000Z",
            durationSec: 1,
          },
        ],
        edges: [
          {
            source: "healthy",
            target: "failing",
            relation: "feeds",
            broken: true,
          },
        ],
        schema: {
          healthy: [
            {
              name: "Sales",
              columns: [
                { name: "Id", dataType: "int64" },
                { name: "Amount", dataType: "decimal" },
              ],
              measures: [{ name: "Revenue" }],
            },
          ],
        },
      }),
    );

    expect(summarizeSnapshot(current)).toMatchObject({
      items: 2,
      healthy: 1,
      stale: 0,
      failing: 1,
      labels: 1,
      principals: 1,
      externalPrincipals: 1,
      grants: 1,
      failedJobs: 1,
      lineage: 1,
      brokenEdges: 1,
      tables: 1,
      columns: 2,
      measures: 1,
    });

    const history = buildAtlasHistory([old, current]);
    expect(history.snapshots.map((entry) => entry.snapshotId)).toEqual([
      "new",
      "old",
    ]);
    expect(history.trend.map((entry) => entry.snapshotId)).toEqual([
      "old",
      "new",
    ]);
    expect(history.changes.every((change) => change.snapshotId === "new")).toBe(
      true,
    );
    expect(history.snapshots[0].catalog).not.toHaveProperty("comments");
    expect(history.snapshots[0].catalog).not.toHaveProperty("syncRuns");
  });
});
