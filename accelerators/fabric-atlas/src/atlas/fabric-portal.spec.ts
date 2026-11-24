import { describe, expect, it } from "vitest";
import {
  FABRIC_GOVERNANCE_SURFACES,
  fabricGovernanceSurfaceUrl,
  fabricItemUrl,
  fabricWorkspaceUrl,
  findingFixUrl,
} from "./fabric-portal";
import type { AtlasData } from "./model";

const WS = "11111111-2222-4333-8444-555555555555";
const ITEM = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const PORTAL = "https://portal.example/";

const data: Pick<AtlasData, "workspace" | "items"> = {
  workspace: { fabricId: WS, displayName: "W", capacity: "F2", region: "West Europe" },
  items: [
    { fabricId: ITEM, displayName: "Sales", itemType: "Lakehouse", health: "healthy", endorsement: "none", tags: [] },
  ],
};

describe("Fabric portal links", () => {
  it("deep-links known item types and falls back to the workspace list", () => {
    expect(fabricItemUrl(WS, ITEM, "Lakehouse", PORTAL)).toBe(
      `https://portal.example/groups/${WS}/lakehouses/${ITEM}?experience=power-bi`,
    );
    expect(fabricItemUrl(WS, ITEM, "Dataflow", PORTAL)).toBe(fabricWorkspaceUrl(WS, PORTAL));
  });

  it("never interpolates non-UUID identifiers", () => {
    expect(fabricItemUrl(WS, "../admin", "Lakehouse", PORTAL)).toBe(
      `https://portal.example/groups/${WS}/list?experience=power-bi`,
    );
    expect(fabricWorkspaceUrl("me/../x", PORTAL)).toBe("https://portal.example");
  });

  it("opens the item for item findings and the workspace otherwise", () => {
    expect(findingFixUrl({ itemId: ITEM, target: { kind: "item", itemId: ITEM } }, data, PORTAL)).toContain(
      `/lakehouses/${ITEM}`,
    );
    expect(findingFixUrl({ target: { kind: "workspace" } }, data, PORTAL)).toBe(
      fabricWorkspaceUrl(WS, PORTAL),
    );
  });
});

describe("Fabric governance surfaces", () => {
  it("builds tenant-agnostic links on the configured portal", () => {
    const urls = FABRIC_GOVERNANCE_SURFACES.map((surface) => fabricGovernanceSurfaceUrl(surface.path, PORTAL));
    expect(urls).toEqual([
      "https://portal.example/onelake?experience=fabric-developer",
      "https://portal.example/admin-portal?experience=fabric-developer",
    ]);
    for (const url of urls) expect(url).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });
});
