import { describe, expect, it } from "vitest";
import {
  MAX_EXPANDED_OBJECT_TABLES,
  objectLineageReducer,
  parseObjectLineageLocation,
  placeBlock,
  restoreObjectLineageState,
  writeObjectLineageLocation,
  type ObjectLineageState,
} from "./object-lineage-state";

const MODEL = "253bc19c-8fe0-4c83-b52c-c525c11598d0";
const OBJECT = "measure\u0000laboratory results\u0000laboratory tests";

describe("Object Lineage state", () => {
  it("restores the issue #49 X-Ray deep link", () => {
    const params = new URLSearchParams(
      `xray.model=${MODEL}&xray.object=measure%00laboratory+results%00laboratory+tests`,
    );
    const location = parseObjectLineageLocation(params, "");
    const state = restoreObjectLineageState(location, [
      { key: "laboratory results", anchorY: 120, height: 240 },
    ]);

    expect(location).toEqual({
      itemId: MODEL,
      tables: ["laboratory results"],
      focus: OBJECT,
      dax: "direct",
    });
    expect(state.blocks).toEqual([
      { table: "laboratory results", y: 120, height: 240 },
    ]);
    expect(state.focus).toBe(OBJECT);
  });

  it("keeps existing block positions stable", () => {
    const first = { table: "a", y: 100, height: 200 };
    const secondY = placeBlock([first], 120, 160);
    const thirdY = placeBlock(
      [first, { table: "b", y: secondY, height: 160 }],
      140,
      120,
    );

    expect(secondY).toBe(316);
    expect(thirdY).toBe(492);
    expect(first.y).toBe(100);
  });

  it("caps expansion and reset keeps the active item", () => {
    let state: ObjectLineageState = {
      itemId: MODEL,
      blocks: [],
      dax: "direct" as const,
    };
    for (let index = 0; index < MAX_EXPANDED_OBJECT_TABLES + 1; index++) {
      state = objectLineageReducer(state, {
        type: "expand",
        table: `table ${index}`,
        anchorY: index * 50,
        height: 120,
      });
    }

    expect(state.blocks).toHaveLength(MAX_EXPANDED_OBJECT_TABLES);
    expect(state.notice).toBe("expansion-limit");
    expect(
      objectLineageReducer(state, { type: "reset", itemId: MODEL }),
    ).toEqual({ itemId: MODEL, blocks: [], dax: "direct" });
  });

  it("writes only canonical Object Lineage parameters", () => {
    const url = new URL(
      `https://example.test/?table=Legacy&xray.model=${MODEL}&xray.object=old#map`,
    );
    writeObjectLineageLocation(url, {
      itemId: MODEL,
      blocks: [
        { table: "laboratory results", y: 100, height: 200 },
      ],
      focus: OBJECT,
      dax: "transitive",
    });

    expect(url.searchParams.get("lineage")).toBe("objects");
    expect(url.searchParams.get("item")).toBe(MODEL);
    expect(
      decodeURIComponent(url.searchParams.get("tables") ?? ""),
    ).toBe("laboratory results");
    expect(url.searchParams.get("object")).toBe(OBJECT);
    expect(url.searchParams.get("dax")).toBe("transitive");
    expect(url.searchParams.has("table")).toBe(false);
    expect(url.searchParams.has("xray.object")).toBe(false);
  });
});
