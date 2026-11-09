import { describe, expect, it } from "vitest";
import { hasRecordedAccess, requestAccessLinks } from "./request-access";
import type { AtlasData } from "./model";

const WS = "11111111-2222-4333-8444-555555555555";
const ITEM = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const OTHER = "66666666-7777-4888-9999-bbbbbbbbbbbb";

const data = {
  items: [
    { fabricId: ITEM, displayName: "Sales", itemType: "Lakehouse", ownerEmail: "owner@contoso.com" },
    { fabricId: OTHER, displayName: "Other", itemType: "Report" },
  ],
  principals: [{ principalId: "p1", displayName: "Ana", kind: "user", email: "Ana@Contoso.com", workspaceRole: "Viewer" }],
  grants: [{ itemFabricId: ITEM, principalRef: "p1", accessLevel: "view", source: "directShare" }],
} as unknown as Pick<AtlasData, "items" | "principals" | "grants">;

describe("request access", () => {
  it("hides the action only when the snapshot records access for the user", () => {
    expect(hasRecordedAccess(data, ITEM, "ana@contoso.com")).toBe(true);
    expect(hasRecordedAccess(data, OTHER, "ana@contoso.com")).toBe(false);
    expect(hasRecordedAccess(data, ITEM, "bob@contoso.com")).toBe(false);
    expect(hasRecordedAccess(data, ITEM, undefined)).toBe(false);
  });

  it("opens the Fabric item and prefills a mail to the recorded owner", () => {
    const links = requestAccessLinks(
      { fabricId: ITEM, displayName: "Sales", itemType: "Lakehouse", ownerEmail: "owner@contoso.com" },
      { fabricId: WS, displayName: "Finance" },
      "https://portal.example",
    );
    expect(links.fabricUrl).toBe(`https://portal.example/groups/${WS}/lakehouses/${ITEM}?experience=power-bi`);
    expect(links.mailto).toMatch(/^mailto:owner@contoso\.com\?subject=Access%20request%3A%20Sales&body=/);
    expect(decodeURIComponent(links.mailto!.split("body=")[1])).toContain('workspace "Finance"');
  });

  it("offers only the Fabric link when no owner email is recorded", () => {
    expect(
      requestAccessLinks({ fabricId: ITEM, displayName: "Sales", itemType: "Lakehouse" }, { fabricId: WS, displayName: "F" })
        .mailto,
    ).toBeUndefined();
  });
});
