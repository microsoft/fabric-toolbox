import { describe, expect, it } from "vitest";
import { collectionSectionLabel, collectionStatusReason } from "./collection-status-copy";

describe("collection status copy", () => {
  it("labels raw section keys in plain language", () => {
    expect(collectionSectionLabel("storageSchema")).toBe("Lakehouse / Warehouse tables");
    expect(collectionSectionLabel("someNewSection")).toBe("some New Section");
  });

  it("explains why lakehouse tables are missing", () => {
    expect(collectionStatusReason("unsupported", "storage-schema-unavailable")).toMatch(/Lakehouse Tables REST/);
    expect(collectionStatusReason("unsupported", "token-unavailable")).toMatch(/no SQL token/);
  });

  it("stays silent for complete sections and keeps unknown codes visible", () => {
    expect(collectionStatusReason("complete")).toBeUndefined();
    expect(collectionStatusReason("failed", "weird-code")).toBe("Code: weird-code");
  });
});
