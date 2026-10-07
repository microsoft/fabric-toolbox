import { describe, expect, it } from "vitest";
import {
  PREVIEW_API_REGISTRY,
  previewApiDescriptors,
  previewMaturityLabel,
} from "./preview-api";

describe("preview API registry", () => {
  it("deduplicates feature IDs without changing their order", () => {
    expect(
      previewApiDescriptors([
        "item-relations",
        "catalog-search",
        "item-relations",
      ]).map((descriptor) => descriptor.id),
    ).toEqual(["item-relations", "catalog-search"]);
  });

  it("keeps maturity labels explicit", () => {
    expect(previewMaturityLabel("beta")).toBe("Beta");
    expect(previewMaturityLabel("private-preview")).toBe(
      "Private Preview",
    );
    expect(previewMaturityLabel("unconfirmed")).toBe(
      "Availability unconfirmed",
    );
  });

  it("keeps every descriptor bounded to documented HTTPS evidence", () => {
    for (const descriptor of Object.values(PREVIEW_API_REGISTRY)) {
      expect(descriptor.documentationUrl).toMatch(/^https:\/\//);
      expect(descriptor.apiVersion.trim()).not.toBe("");
      expect(descriptor.evidenceBoundary.trim()).not.toBe("");
      expect(descriptor.limitations.length).toBeGreaterThan(0);
      expect(
        Number.isFinite(Date.parse(descriptor.lastVerifiedAt)),
      ).toBe(true);
    }
  });
});
