import { describe, expect, it } from "vitest";
import {
  previewRelationFamily,
  snapshotRelationFamily,
} from "./lineage-relation-family";

describe("lineage relation families", () => {
  it("treats orchestration and containment labels as control relations", () => {
    for (const relation of ["orchestrates", "endpoint", "SQL endpoint", "database", "default db", "KQL database"]) {
      expect(snapshotRelationFamily(relation)).toBe("control");
    }
    for (const relation of ["reads", "writes", "binds", "Direct Lake", "dashboard report", "grounds"]) {
      expect(snapshotRelationFamily(relation)).toBe("data");
    }
  });

  it("maps Beta control and lifecycle flows to control and keeps dependencies with data", () => {
    expect(previewRelationFamily("control")).toBe("control");
    expect(previewRelationFamily("lifecycle")).toBe("control");
    expect(previewRelationFamily("data")).toBe("data");
    expect(previewRelationFamily("association")).toBe("data");
    expect(previewRelationFamily("unknown")).toBe("data");
  });
});
