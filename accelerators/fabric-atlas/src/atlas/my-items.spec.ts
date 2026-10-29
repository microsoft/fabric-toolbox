import { describe, expect, it } from "vitest";
import type { Item, Principal } from "./model";
import {
  findingOwnership,
  isWorkspaceAdmin,
  itemOwnership,
  myItemsScope,
  myScopedItems,
  radarEntryOwnership,
  summarizeMyItems,
} from "./my-items";
import type { RadarEntry } from "./radar";

const item = (fabricId: string, ownerEmail?: string) =>
  ({ fabricId, displayName: fabricId, itemType: "Lakehouse", ownerEmail }) as Item;

const items = [
  item("mine", "Me@Contoso.com "),
  item("other", "someone@contoso.com"),
  item("unknown"),
];
const principals = [
  { principalId: "p1", displayName: "Me", kind: "user", email: "me@contoso.com", workspaceRole: "Admin" },
] as Principal[];

describe("my items", () => {
  it("classifies ownership by email and reports a missing owner as unknown", () => {
    expect(itemOwnership(items[0], "me@contoso.com")).toBe("mine");
    expect(itemOwnership(items[1], "me@contoso.com")).toBe("other");
    expect(itemOwnership(items[2], "me@contoso.com")).toBe("unknown");
    expect(itemOwnership(undefined, "me@contoso.com")).toBe("unknown");
  });

  it("keeps unknown owners in scope and summarizes counts", () => {
    expect(myScopedItems(items, "me@contoso.com").map((entry) => entry.fabricId)).toEqual([
      "mine",
      "unknown",
    ]);
    expect(summarizeMyItems(items, "me@contoso.com")).toEqual({ mine: 1, unknown: 1, total: 3 });
  });

  it("assigns workspace findings to workspace admins only", () => {
    expect(isWorkspaceAdmin(principals, "ME@contoso.com")).toBe(true);
    const admin = myItemsScope(items, principals, "me@contoso.com");
    const viewer = myItemsScope(items, [], "me@contoso.com");
    expect(findingOwnership({}, admin)).toBe("mine");
    expect(findingOwnership({}, viewer)).toBe("other");
    expect(findingOwnership({ itemId: "unknown" }, viewer)).toBe("unknown");
  });

  it("resolves radar entry items from findings, changes and incidents", () => {
    const scope = myItemsScope(items, [], "me@contoso.com");
    const base = { id: "r", severity: "high", title: "t", detail: "d" } as const;
    expect(
      radarEntryOwnership({ ...base, delta: { finding: { itemId: "mine" } } } as RadarEntry, scope),
    ).toBe("mine");
    expect(
      radarEntryOwnership({ ...base, risk: { change: { itemFabricId: "other" } } } as RadarEntry, scope),
    ).toBe("other");
    expect(
      radarEntryOwnership({ ...base, incident: { incident: { itemId: "unknown" } } } as RadarEntry, scope),
    ).toBe("unknown");
  });
});
