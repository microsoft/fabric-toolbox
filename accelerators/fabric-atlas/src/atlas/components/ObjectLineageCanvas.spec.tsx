import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AtlasData, Item, ModelTableSchema } from "../model";
import { xrayObjectKey } from "../semantic-xray";
import { ObjectLineageCanvas } from "./ObjectLineageCanvas";

const MODEL = "253bc19c-8fe0-4c83-b52c-c525c11598d0";
const item: Item = {
  fabricId: MODEL,
  displayName: "HealthcareOperationsModel",
  itemType: "SemanticModel",
  health: "healthy",
  endorsement: "none",
  tags: [],
};
const tables: ModelTableSchema[] = [
  {
    name: "Laboratory Results",
    columns: [{ name: "Result Id", dataType: "string" }],
    measures: [
      { name: "Laboratory Tests", expr: "COUNTROWS('Laboratory Results')" },
      { name: "Abnormal Laboratory Tests", expr: "[Laboratory Tests]" },
      { name: "Critical Laboratory Tests", expr: "[Laboratory Tests]" },
      {
        name: "Abnormal Laboratory Rate",
        expr: "DIVIDE([Abnormal Laboratory Tests], [Laboratory Tests])",
      },
    ],
  },
  {
    name: "Patients",
    columns: [{ name: "Patient Id", dataType: "string" }],
    measures: [{ name: "Patients", expr: "COUNTROWS(Patients)" }],
  },
];
const data: AtlasData = {
  workspace: {
    fabricId: "11111111-1111-4111-8111-111111111111",
    displayName: "Fixture",
    capacity: "",
    region: "",
  },
  items: [item],
  edges: [],
  principals: [],
  grants: [],
  jobs: [],
  config: [],
  comments: [],
  syncRuns: [],
  schema: { [MODEL]: tables },
};

describe("ObjectLineageCanvas", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/#map");
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("restores an X-Ray deep link and selects the requested measure", () => {
    const key = xrayObjectKey(
      "measure",
      "Laboratory Results",
      "Laboratory Tests",
    );
    window.history.replaceState(
      null,
      "",
      `/?lineage=objects&item=${MODEL}&xray.object=${encodeURIComponent(key)}#map`,
    );

    render(
      <ObjectLineageCanvas
        data={data}
        item={item}
        tables={tables}
        query=""
        onOpenXRay={vi.fn()}
        onSelectItem={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("region", {
        name: "Laboratory Results fields",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Laboratory Tests" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(new URL(window.location.href).searchParams.get("object")).toBe(key);
  });

  it("searches the complete inventory and reveals a collapsed object", () => {
    render(
      <ObjectLineageCanvas
        data={data}
        item={item}
        tables={tables}
        query="critical"
        onOpenXRay={vi.fn()}
        onSelectItem={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Critical Laboratory Tests.*Laboratory Results/i,
      }),
    );

    expect(
      screen.getByRole("button", { name: "Critical Laboratory Tests" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("clears the object view without clearing the active model", () => {
    render(
      <ObjectLineageCanvas
        data={data}
        item={item}
        tables={tables}
        query=""
        onOpenXRay={vi.fn()}
        onSelectItem={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Expand Laboratory Results",
      }),
    );
    expect(
      screen.getByRole("region", {
        name: "Laboratory Results fields",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Clear object view" }),
    );

    expect(
      screen.queryByRole("region", {
        name: "Laboratory Results fields",
      }),
    ).not.toBeInTheDocument();
    const params = new URL(window.location.href).searchParams;
    expect(params.get("item")).toBe(MODEL);
    expect(params.has("object")).toBe(false);
    expect(params.has("tables")).toBe(false);
  });
});
