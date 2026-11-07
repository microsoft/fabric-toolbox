import { describe, expect, it } from "vitest";
import { snapshotCatalogFromData } from "./history";
import { SAMPLE_DATA } from "./model";
import { POSTURE_TARGETS, scorePosture } from "./posture";
import type { SnapshotCatalog } from "./history";

describe("scorePosture", () => {
  it("defaults all six governance pillars to 70 percent", () => {
    expect(Object.keys(POSTURE_TARGETS)).toHaveLength(6);
    expect(Object.values(POSTURE_TARGETS)).toEqual([
      70,
      70,
      70,
      70,
      70,
      70,
    ]);
  });

  it("excludes not-applicable metrics instead of counting zero", () => {
    const catalog = snapshotCatalogFromData(structuredClone(SAMPLE_DATA));
    catalog.schema = {};
    catalog.items = catalog.items.filter(
      (item) => item.itemType !== "SemanticModel",
    );
    const score = scorePosture(catalog);
    const documentation = score.pillars.find(
      (pillar) => pillar.pillar === "documentation",
    )!;

    expect(documentation.score).not.toBeNull();
    expect(documentation.score).toBeGreaterThanOrEqual(0);
  });

  it("returns null for an empty non-evaluable catalog", () => {
    const catalog = snapshotCatalogFromData(structuredClone(SAMPLE_DATA));
    catalog.items = [];
    catalog.principals = [];
    catalog.grants = [];
    catalog.jobs = [];
    catalog.edges = [];
    catalog.schema = {};
    const score = scorePosture(catalog);

    expect(score.global).toBeNull();
    expect(score.pillars.every((pillar) => pillar.score == null)).toBe(true);
  });

  it("is deterministic and clamps target overrides", () => {
    const catalog = snapshotCatalogFromData(structuredClone(SAMPLE_DATA));
    const first = scorePosture(catalog, { ownership: 120 });
    const second = scorePosture(
      { ...catalog, items: [...catalog.items].reverse() },
      { ownership: 120 },
    );

    expect(second).toEqual(first);
    expect(
      first.pillars.find((pillar) => pillar.pillar === "ownership")?.target,
    ).toBe(100);
  });

  it("normalizes finding penalties by workspace size", () => {
    const build = (count: number): SnapshotCatalog => ({
      workspace: {
        fabricId: "workspace",
        displayName: "Workspace",
        capacity: "",
        region: "",
      },
      items: Array.from({ length: count }, (_, index) => ({
        fabricId: `item-${index}`,
        displayName: `Item ${index}`,
        itemType: "Report",
        health: "healthy",
        endorsement: "none",
        tags: [],
      })),
      principals: [
        {
          principalId: "guest",
          displayName: "Guest",
          kind: "guest",
          external: true,
          workspaceRole: "Viewer",
        },
      ],
      grants: Array.from({ length: count }, (_, index) => ({
        itemFabricId: `item-${index}`,
        principalRef: "guest",
        accessLevel: "view" as const,
        source: "directShare" as const,
        flag: "external" as const,
      })),
      edges: [],
      jobs: [],
      config: [],
      schema: {},
    });
    const small = scorePosture(build(1));
    const large = scorePosture(build(5));

    expect(
      small.pillars.find((pillar) => pillar.pillar === "access")?.score,
    ).toBe(
      large.pillars.find((pillar) => pillar.pillar === "access")?.score,
    );
  });
});
