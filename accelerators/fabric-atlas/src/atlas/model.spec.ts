import { describe, expect, it } from "vitest";
import { ITEM_TYPES, typeMeta } from "./model";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

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
      color: "#697587",
      icon: "Box",
    });
    expect(typeMeta(undefined).label).toBe("Item");
  });

  it("keeps white glyph codes readable on every item type colour", () => {
    for (const meta of [...Object.values(ITEM_TYPES), typeMeta("Unknown")]) {
      expect(contrastWithWhite(meta.color), meta.label).toBeGreaterThanOrEqual(4.5);
    }
  });
});
