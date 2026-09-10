import { describe, expect, it } from "vitest";
import { ITEM_TYPES, typeMeta } from "./model";

describe("item type metadata", () => {
  it("defines the newer Fabric discovery item types", () => {
    expect(ITEM_TYPES.Ontology).toMatchObject({
      label: "Ontology",
      code: "ON",
    });
    expect(ITEM_TYPES.GraphModel).toMatchObject({
      label: "Graph model",
      code: "GM",
    });
    expect(ITEM_TYPES.DataAgent).toMatchObject({
      label: "Data agent",
      code: "DA",
    });
    expect(ITEM_TYPES.KQLQueryset).toMatchObject({
      label: "KQL queryset",
      code: "QS",
    });
    expect(ITEM_TYPES.KQLDashboard).toMatchObject({
      label: "KQL dashboard",
      code: "KD",
    });
  });

  it("renders unknown forward-compatible item types with neutral metadata", () => {
    expect(typeMeta("FutureFabricArtifact")).toEqual({
      label: "FutureFabricArtifact",
      code: "··",
      color: "#8b95a5",
      icon: "Box",
    });
    expect(typeMeta(undefined).label).toBe("Item");
  });
});
