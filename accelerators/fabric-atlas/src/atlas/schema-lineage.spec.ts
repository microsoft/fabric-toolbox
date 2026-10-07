import { describe, expect, it } from "vitest";
import { buildSchemaDependencies } from "./schema-lineage";
import type { AtlasData } from "./model";
import { SAMPLE_DATA } from "./model";

function data(): Pick<AtlasData, "items" | "schema" | "edges"> {
  return {
    items: [
      {
        fabricId: "lake",
        displayName: "Lake",
        itemType: "Lakehouse",
        health: "healthy",
        endorsement: "none",
        tags: [],
      },
      {
        fabricId: "model",
        displayName: "Model",
        itemType: "SemanticModel",
        health: "healthy",
        endorsement: "none",
        tags: [],
      },
    ],
    edges: [{ source: "lake", target: "model", relation: "Direct Lake" }],
    schema: {
      lake: [
        {
          name: "Sales",
          columns: [{ name: "Amount", dataType: "double" }],
          measures: [],
        },
      ],
      model: [
        {
          name: "Sales",
          columns: [{ name: "Amount", dataType: "double" }],
          measures: [
            { name: "Base", expr: "SUM(Sales[Amount])" },
            { name: "Margin", expr: "[Base] / 2" },
          ],
        },
      ],
    },
  };
}

describe("buildSchemaDependencies", () => {
  it("resolves real DAX targets and marks source hops as inferred", () => {
    expect(buildSchemaDependencies(data())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: expect.objectContaining({ name: "Base" }),
          to: expect.objectContaining({
            itemId: "model",
            kind: "column",
            name: "Amount",
          }),
          confidence: "verified",
        }),
        expect.objectContaining({
          from: expect.objectContaining({ name: "Base" }),
          to: expect.objectContaining({
            itemId: "lake",
            kind: "column",
            name: "Amount",
          }),
          confidence: "inferred",
        }),
        expect.objectContaining({
          from: expect.objectContaining({ name: "Margin" }),
          to: expect.objectContaining({ kind: "measure", name: "Base" }),
          confidence: "verified",
        }),
      ]),
    );
  });

  it("emits nothing for unresolved or ambiguous targets", () => {
    const value = data();
    value.schema!.model[0].measures = [
      { name: "Unknown", expr: "Missing[Column] + [No measure]" },
    ];
    expect(buildSchemaDependencies(value)).toEqual([]);
  });

  it("requires item lineage and a unique upstream schema match", () => {
    const value = data();
    value.edges = [];
    expect(
      buildSchemaDependencies(value).filter(
        (dependency) => dependency.confidence === "inferred",
      ),
    ).toEqual([]);
  });

  it("resolves the preview Total Revenue measure", () => {
    expect(
      buildSchemaDependencies(SAMPLE_DATA),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: expect.objectContaining({ name: "Total Revenue" }),
          to: expect.objectContaining({ name: "total_revenue_chf" }),
          confidence: "verified",
        }),
      ]),
    );
  });

  it("does not collapse two qualified schema names to the same leaf", () => {
    const value = data();
    value.schema!.model[0].name = "sales.Orders";
    value.schema!.model[0].measures[0].expr =
      "'sales.Orders'[Amount]";
    value.schema!.lake[0].name = "archive.Orders";

    expect(
      buildSchemaDependencies(value).filter(
        (dependency) => dependency.confidence === "inferred",
      ),
    ).toEqual([]);
  });

  it("resolves a table-qualified measure when no column collides", () => {
    const value = data();
    value.schema!.model[0].measures[1].expr = "'Sales'[Base] / 2";

    expect(buildSchemaDependencies(value)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: expect.objectContaining({ name: "Margin" }),
          to: expect.objectContaining({
            kind: "measure",
            tableName: "Sales",
            name: "Base",
          }),
          confidence: "verified",
        }),
      ]),
    );
  });
});
